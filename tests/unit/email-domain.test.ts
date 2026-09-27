import { describe, expect, it } from "vitest";
import { detectionMessage, detectUniversity, emailDomain, type DomainDirectory } from "@/lib/auth/email-domain";

const directory: DomainDirectory = {
  domains: {
    "nutech.edu.pk": [{ id: "u1", name: "NUTECH" }],
    "preston.edu.pk": [
      { id: "u2", name: "Preston University Karachi" },
      { id: "u3", name: "Preston University Kohat" },
    ],
  },
  personal: ["gmail.com", "outlook.com"],
};

describe("emailDomain", () => {
  it("lower-cases and trims", () => {
    expect(emailDomain("  Ali@NUTECH.edu.pk ")).toBe("nutech.edu.pk");
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["ali", "ali@", "@nutech.edu.pk", "ali@nutech", "a b@nutech.edu.pk", "ali@-bad.pk"]) {
      expect(emailDomain(bad)).toBeNull();
    }
  });
});

describe("detectUniversity", () => {
  it("matches a university domain", () => {
    expect(detectUniversity("ali@nutech.edu.pk", directory)).toEqual({
      kind: "match",
      domain: "nutech.edu.pk",
      universities: [{ id: "u1", name: "NUTECH" }],
    });
  });
  it("returns every owner of a shared domain (the picker)", () => {
    const d = detectUniversity("x@preston.edu.pk", directory);
    expect(d.kind === "match" && d.universities.map((u) => u.id)).toEqual(["u2", "u3"]);
  });
  it("refuses personal email with the spec's wording", () => {
    const d = detectUniversity("ali@gmail.com", directory);
    expect(d.kind).toBe("personal");
    expect(detectionMessage(d)).toBe("Use your university email.");
  });
  it("says the university isn't on Skilient for unknown domains, including subdomains", () => {
    for (const email of ["ali@example.org", "ali@cs.nutech.edu.pk"]) {
      const d = detectUniversity(email, directory);
      expect(d.kind).toBe("unknown");
      expect(detectionMessage(d)).toBe("Your university isn't on Skilient yet.");
    }
  });
  it("is quiet while the field is empty", () => {
    expect(detectUniversity("  ", directory)).toEqual({ kind: "empty" });
    expect(detectionMessage({ kind: "empty" })).toBeNull();
  });
});
