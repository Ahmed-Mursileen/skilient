import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { invoiceHtml, type InvoiceDocument } from "@/lib/billing/invoices";
import { grantValue, money } from "@/lib/billing/constants";
import { describeNotification } from "@/supabase/functions/_shared/notify/describe";

/** Billing wording and documents: every billing notice says something specific; invoices escape and mark drafts. */
const migrations = readdirSync(join(process.cwd(), "supabase", "migrations")).map((f) => readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8")).join("\n");
const billingTypes = [...migrations.matchAll(/\('(billing_[a-z_]+)', 'billing', (?:true|false)\)/g)].map((m) => m[1]!);

const doc = (over: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
  id: "i1", number: "TEST-2026-000001", kind: "invoice", purpose: "subscription",
  lines: [{ description: "Starter <script>alert(1)</script>", quantity: 1, unit_amount: 15000, amount: 15000 }],
  subtotal: 15000, tax_lines: [{ label: "Punjab sales tax on services", province: "Punjab", rate: 0.16, amount: 2400 }], tax_total: 2400, total: 17400,
  currency: "PKR", status: "issued", issued_at: "2026-10-05T05:00:00Z", due_at: "2026-11-04T05:00:00Z", paid_at: null, po_number: "PO-1",
  bill_to: { name: "Acme & Co", province: "Punjab" }, seller: {}, draft_reasons: ["test_mode", "company_details_missing"], live: false,
  content_hash: "a".repeat(64), credits: null, pay_by_bank: true, ...over,
});

describe("billing notices", () => {
  it("every billing notification type has its own wording and a billing link", () => {
    expect(billingTypes.length).toBeGreaterThanOrEqual(14);
    for (const type of billingTypes) {
      const d = describeNotification({ type, actorName: null, entityType: "billing", entityId: "x", data: { subject: "org", amount: 17400, currency: "PKR", title: "Starter" } });
      expect(d.text, type).not.toBe("You have a new notification.");
      expect(d.href, type).toMatch(/billing$/);
    }
  });
});

describe("invoices", () => {
  it("escape every value and print the tax line, PO and due date", () => {
    const html = invoiceHtml(doc());
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Acme &amp; Co");
    expect(html).toContain("Punjab sales tax on services (Punjab, 16.00%)");
    expect(html).toContain("PO PO-1");
    expect(html).toContain("PKR 17,400");
  });

  it("say TEST or DRAFT with the reasons until they are final tax invoices", () => {
    expect(invoiceHtml(doc())).toContain(">TEST<");
    expect(invoiceHtml(doc({ live: true, draft_reasons: ["company_details_missing"] }))).toContain(">DRAFT<");
    expect(invoiceHtml(doc())).toContain("company details aren&#x27;t set yet");
    const final = invoiceHtml(doc({ live: true, draft_reasons: [], seller: { legal_name: "Skilient (Private) Limited", ntn: "1234567-8", strn: "32-77", address: "Islamabad" } }));
    expect(final).toContain("Tax invoice");
    expect(final).not.toContain(">DRAFT<");
  });

  it("show bank details only when they are set", () => {
    expect(invoiceHtml(doc())).not.toContain("Pay by bank transfer");
    expect(invoiceHtml(doc({ seller: { bank: { account_title: "Skilient", bank_name: "HBL", iban: "PK00HABB0000000000000000" } } }))).toContain("IBAN PK00HABB0000000000000000");
  });

  it("formats money and grant values", () => {
    expect(money(399, "PKR")).toBe("PKR 399");
    expect(money(55, "USD")).toBe("USD 55.00");
    expect(grantValue(100000)).toBe("Unlimited");
    expect(grantValue(true)).toBe("Yes");
    expect(grantValue("final_year")).toBe("final year");
  });
});
