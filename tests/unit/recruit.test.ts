import { describe, expect, it } from "vitest";
import { bearer } from "@/lib/api/v1";
import { orgInviteEmail } from "@/lib/email/templates";
import { filtersFromParams, filtersToParams, CONTACT_TEMPLATES, CONTACT_LIMITS } from "@/lib/recruit/constants";

describe("talent filters in the URL (PRD 5.20)", () => {
  it("round-trips every filter the allow-list has", () => {
    const sp = { skills: "react:3,python:2", code: "1", tier: "spark", active: "90", avail: "internship,part_time", city: "Lahore", remote: "1", from: "2026", to: "2028" };
    const f = filtersFromParams(sp);
    expect(f).toMatchObject({
      skills: [{ skill: "react", min_level: 3 }, { skill: "python", min_level: 2 }],
      code_check: true,
      min_tier: "spark",
      active_days: 90,
      availability: ["internship", "part_time"],
      city: "Lahore",
      remote: true,
      batch_from: 2026,
      batch_to: 2028,
    });
    expect(filtersFromParams(Object.fromEntries(filtersToParams(f)))).toEqual(f);
  });

  it("ignores protected attributes and anything malformed", () => {
    const f = filtersFromParams({ gender: "f", religion: "x", age: "20", ethnicity: "y", photo: "1", skills: "React:9,../x:1,react:5", tier: "gold", active: "7", avail: "astronaut" });
    expect(f).toEqual({});
    expect(Object.keys(f)).not.toContain("gender");
  });

  it("caps skills at ten", () => {
    const many = Array.from({ length: 14 }, (_, i) => `skill${i}:2`).join(",");
    expect(filtersFromParams({ skills: many }).skills).toHaveLength(10);
  });
});

describe("contact templates", () => {
  it("are long enough to be sent as they are once the brackets are filled", () => {
    for (const t of CONTACT_TEMPLATES) expect(t.text.length).toBeGreaterThanOrEqual(CONTACT_LIMITS.minMessage);
  });
});

describe("API bearer tokens", () => {
  const request = (value?: string) => new Request("https://skilient.test/api/v1/shortlists", { headers: value ? { authorization: value } : {} });
  it("reads a bearer token and nothing else", () => {
    expect(bearer(request("Bearer skl_" + "a".repeat(30)))).toBe("skl_" + "a".repeat(30));
    expect(bearer(request("bearer " + "b".repeat(24)))).toBe("b".repeat(24));
    for (const bad of ["", "Basic abc", "Bearer short", "Bearer a b c d e f g h i j k l m n o p"]) expect(bearer(request(bad || undefined))).toBeNull();
  });
});

describe("organisation invite email", () => {
  it("names the company, links once-only and says it expires", () => {
    const mail = orgInviteEmail("tariq@acme.com", { orgName: "Acme <script>", role: "recruiter", link: "https://skilient.test/signup/recruiter?invite=abc" });
    expect(mail.to).toBe("tariq@acme.com");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("invite=abc");
    expect(mail.text).toContain("expires in 7 days");
  });
});
