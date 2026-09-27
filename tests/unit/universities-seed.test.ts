import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSV_PATH,
  csvHash,
  latestSyncMigration,
  parseCsv,
  renderMigration,
  slugify,
  toSeedRows,
} from "../../scripts/universities.mjs";

const csv = readFileSync(CSV_PATH, "utf8");

describe("HEC universities seed", () => {
  const rows = toSeedRows(parseCsv(csv));

  it("parses every row with valid domains", () => {
    expect(rows.length).toBeGreaterThanOrEqual(283);
    for (const row of rows) for (const domain of row.domains) expect(domain).toBe(domain.toLowerCase());
  });

  it("includes NUTECH (the beta university) with its confirmed domain", () => {
    const nutech = rows.find((r) => r.name === "National University of Technology (NUTECH)");
    expect(nutech?.domains).toEqual(["nutech.edu.pk"]);
  });

  it("keeps quoted names with commas intact", () => {
    expect(rows.some((r) => r.name === "Aror University of Art, Architecture, Design and Heritage")).toBe(true);
  });

  it("the latest sync migration was generated from this CSV", () => {
    // If this fails: run `node scripts/universities.mjs --write` and commit the new migration.
    expect(latestSyncMigration()?.hash).toBe(csvHash(csv));
  });

  it("hashes the same with CRLF or LF line endings", () => {
    expect(csvHash("a,b\r\nc,d\r\n")).toBe(csvHash("a,b\nc,d\n"));
  });
});

describe("CSV parsing and validation", () => {
  const header = "name,city,province,domains,status\n";

  it("handles quotes, doubled quotes and CRLF", () => {
    const [row] = parseCsv('name,city,province,domains\r\n"A ""B"", C",Lahore,Punjab,a.edu.pk;b.edu.pk\r\n');
    expect(row).toEqual({ name: 'A "B", C', city: "Lahore", province: "Punjab", domains: "a.edu.pk;b.edu.pk" });
  });

  it("refuses a missing column, a bad domain, an unknown province and duplicates", () => {
    expect(() => parseCsv("name,city\nA,B\n")).toThrow(/province/);
    expect(() => toSeedRows(parseCsv(`${header}Uni,X,Punjab,not a domain,\n`))).toThrow(/valid domain/);
    expect(() => toSeedRows(parseCsv(`${header}Uni,X,Mars,u.edu.pk,\n`))).toThrow(/province/);
    expect(() => toSeedRows(parseCsv(`${header}Uni,X,ICT,u.edu.pk,\nUni,Y,ICT,v.edu.pk,\n`))).toThrow(/duplicate/);
  });

  it("lower-cases and de-duplicates domains; blank domains give none", () => {
    const [a, b] = toSeedRows(parseCsv(`${header}Uni A,X,ICT,U.EDU.PK; u.edu.pk ,\nUni B,Y,ICT,,\n`));
    expect(a.domains).toEqual(["u.edu.pk"]);
    expect(b.domains).toEqual([]);
  });

  it("slugifies names", () => {
    expect(slugify("Institute of Business Administration")).toBe("institute-of-business-administration");
    expect(slugify("HANDS Institute of Development Studies")).toBe("hands-institute-of-development-studies");
    expect(slugify("Ali Institute & Co. (AIC)")).toBe("ali-institute-and-co-aic");
  });

  it("renders a migration that records the CSV hash", () => {
    const sql = renderMigration(toSeedRows(parseCsv(`${header}Uni,X,ICT,u.edu.pk,\n`)), "f".repeat(64));
    expect(sql).toContain(`-- csv-sha256: ${"f".repeat(64)}`);
    expect(sql).toContain("select private.sync_hec_universities($hec$");
    expect(sql).toContain('"domains":["u.edu.pk"]');
  });
});
