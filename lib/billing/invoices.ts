import "server-only";

import { esc } from "@/lib/cv/document";
import { launchBrowser } from "@/lib/cv/browser";
import { DRAFT_REASON_LABELS, INVOICE_KIND_LABELS, money } from "./constants";

/**
 * Invoices, receipts and credit notes as PDF (PRD 4b.10), printed by the same Chromium as CVs. Rendered on
 * demand from the issued row, whose content never changes (its hash is printed), so nothing is stored in
 * Storage (decisions.md 2026-10-05). A document is marked DRAFT while it is a test or while Skilient's company
 * details or the province's tax rate are missing.
 */
export interface InvoiceDocument {
  id: string;
  number: string;
  kind: "invoice" | "receipt" | "credit_note";
  purpose: string;
  lines: { description: string; quantity: number; unit_amount: number; amount: number }[];
  subtotal: number;
  tax_lines: { label: string; province: string; rate: number; amount: number }[];
  tax_total: number;
  total: number;
  currency: string;
  status: "issued" | "paid" | "void";
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  po_number: string | null;
  bill_to: { name?: string; address?: string; province?: string; ntn?: string; email?: string };
  seller: {
    legal_name?: string;
    trading_name?: string;
    ntn?: string;
    strn?: string;
    address?: string;
    email?: string;
    phone?: string;
    bank?: { account_title?: string; bank_name?: string; iban?: string; swift?: string; branch?: string };
  };
  draft_reasons: string[];
  live: boolean;
  content_hash: string;
  credits: string | null;
  pay_by_bank: boolean;
}

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : "";
}

export function invoiceTitle(doc: InvoiceDocument): string {
  if (doc.kind !== "invoice") return INVOICE_KIND_LABELS[doc.kind];
  return doc.tax_lines.length > 0 && doc.draft_reasons.length === 0 ? "Tax invoice" : "Invoice";
}

export function invoiceHtml(doc: InvoiceDocument): string {
  const s = doc.seller;
  const b = doc.bill_to;
  const draft = doc.draft_reasons.length > 0;
  const rows = doc.lines
    .map((l) => `<tr><td>${esc(l.description)}</td><td class="n">${esc(l.quantity)}</td><td class="n">${esc(money(l.unit_amount, doc.currency))}</td><td class="n">${esc(money(l.amount, doc.currency))}</td></tr>`)
    .join("");
  const taxes = doc.tax_lines
    .map((t) => `<tr><td colspan="3">${esc(t.label)} (${esc(t.province)}, ${esc((Number(t.rate) * 100).toFixed(2))}%)</td><td class="n">${esc(money(t.amount, doc.currency))}</td></tr>`)
    .join("");
  const bank =
    doc.pay_by_bank && s.bank?.iban
      ? `<section><h3>Pay by bank transfer</h3><p>${esc(s.bank.account_title)} · ${esc(s.bank.bank_name)}${s.bank.branch ? ` · ${esc(s.bank.branch)}` : ""}<br>IBAN ${esc(s.bank.iban)}${s.bank.swift ? ` · SWIFT ${esc(s.bank.swift)}` : ""}<br>Reference: ${esc(doc.number)}</p></section>`
      : "";
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.number)}</title><style>
body{font-family:Barlow,Arial,sans-serif;color:#0E0D0B;margin:0;font-size:11pt}
h1{font-size:20pt;margin:0 0 4mm}h3{font-size:11pt;margin:6mm 0 2mm}
.head{display:flex;justify-content:space-between;gap:10mm}
table{width:100%;border-collapse:collapse;margin-top:6mm}th,td{padding:2mm;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
.n{text-align:right;white-space:nowrap}.total td{font-weight:600;border-top:2px solid #0E0D0B}
.draft{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72pt;color:rgba(192,57,16,.14);transform:rotate(-24deg);font-weight:700}
.note{border:1px solid #C03910;padding:3mm;margin-top:6mm;color:#8a2a0c}.small{font-size:9pt;color:#555}
</style></head><body>` +
    (draft ? `<div class="draft" aria-hidden="true">${doc.live ? "DRAFT" : "TEST"}</div>` : "") +
    `<div class="head"><div><h1>${esc(invoiceTitle(doc))}</h1><p>No. ${esc(doc.number)}<br>Issued ${esc(date(doc.issued_at))}` +
    (doc.due_at ? `<br>Due ${esc(date(doc.due_at))}` : "") +
    (doc.po_number ? `<br>PO ${esc(doc.po_number)}` : "") +
    (doc.credits ? `<br>Credits ${esc(doc.credits)}` : "") +
    `<br>Status: ${esc(doc.status === "paid" ? `Paid ${date(doc.paid_at)}` : doc.status === "void" ? "Void" : "Unpaid")}</p></div>` +
    `<div><strong>${esc(s.legal_name || s.trading_name || "Skilient")}</strong><br>${esc(s.address || "Address to be added")}` +
    (s.ntn ? `<br>NTN ${esc(s.ntn)}` : "") + (s.strn ? `<br>STRN ${esc(s.strn)}` : "") + (s.email ? `<br>${esc(s.email)}` : "") + `</div></div>` +
    `<h3>Billed to</h3><p>${esc(b.name)}${b.address ? `<br>${esc(b.address)}` : ""}${b.province ? `<br>${esc(b.province)}` : ""}${b.ntn ? `<br>NTN ${esc(b.ntn)}` : ""}${b.email ? `<br>${esc(b.email)}` : ""}</p>` +
    `<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Amount</th></tr></thead><tbody>${rows}` +
    `<tr><td colspan="3">Subtotal</td><td class="n">${esc(money(doc.subtotal, doc.currency))}</td></tr>${taxes}` +
    `<tr class="total"><td colspan="3">Total</td><td class="n">${esc(money(doc.total, doc.currency))}</td></tr></tbody></table>` +
    (doc.kind === "receipt" ? `<p class="small">Prices include any applicable tax.</p>` : "") +
    bank +
    (draft ? `<div class="note">${doc.draft_reasons.map((r) => esc(DRAFT_REASON_LABELS[r] ?? r)).join("<br>")}</div>` : "") +
    `<p class="small">Document fingerprint ${esc(doc.content_hash.slice(0, 16))}</p></body></html>`
  );
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(invoiceHtml(doc), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" }, tagged: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
