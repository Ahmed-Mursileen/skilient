#!/usr/bin/env node
/**
 * HEC universities seed (PRD 5.23). The CSV at supabase/seed/hec_universities.csv is the
 * source of truth; this script turns it into a data migration that calls
 * private.sync_hec_universities(), so `supabase db push` carries the list to the hosted
 * project (seed.sql never runs there).
 *
 *   node scripts/universities.mjs --write   # after editing the CSV: adds a new sync migration
 *   node scripts/universities.mjs --check   # exits 1 if the CSV changed without a migration
 *
 * Only name, city, province and domains are loaded; the other columns are reference notes.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CSV_PATH = join(ROOT, "supabase/seed/hec_universities.csv");
export const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const SYNC_SUFFIX = "_sync_hec_universities.sql";

const PROVINCES = new Set(["Punjab", "Sindh", "KP", "Balochistan", "ICT", "AJK", "GB"]);
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const REQUIRED_COLUMNS = ["name", "city", "province", "domains"];

/**
 * @typedef {{ name: string, slug: string, city: string | null, province: string | null, domains: string[] }} SeedRow
 */

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line endings.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);

  const [header, ...body] = rows;
  if (!header) throw new Error("CSV is empty");
  const columns = header.map((h) => h.trim());
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) throw new Error(`CSV is missing the "${required}" column`);
  }
  return body.map((cells, index) => {
    if (cells.length !== columns.length) {
      throw new Error(`CSV row ${index + 2} has ${cells.length} fields, expected ${columns.length}`);
    }
    return Object.fromEntries(columns.map((c, i) => [c, cells[i].trim()]));
  });
}

/** @param {string} name */
export function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

/**
 * Validates and normalises CSV records into the rows the sync function takes.
 * @param {Record<string, string>[]} records
 * @returns {SeedRow[]}
 */
export function toSeedRows(records) {
  const names = new Set();
  const slugs = new Set();
  return records.map((record, index) => {
    const line = index + 2;
    const name = record.name.replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 200) throw new Error(`Row ${line}: name must be 2–200 characters`);
    if (names.has(name)) throw new Error(`Row ${line}: duplicate university "${name}"`);
    names.add(name);

    const slug = slugify(name);
    if (!slug) throw new Error(`Row ${line}: name gives an empty slug`);
    if (slugs.has(slug)) throw new Error(`Row ${line}: slug "${slug}" is already used`);
    slugs.add(slug);

    if (record.province && !PROVINCES.has(record.province)) {
      throw new Error(`Row ${line}: unknown province "${record.province}"`);
    }

    const domains = [
      ...new Set(
        record.domains
          .split(";")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    for (const domain of domains) {
      if (!DOMAIN_RE.test(domain)) throw new Error(`Row ${line}: "${domain}" is not a valid domain`);
    }

    return { name, slug, city: record.city || null, province: record.province || null, domains };
  });
}

/**
 * Hash of the CSV with line endings normalised, so checkouts with CRLF or LF agree.
 * @param {string} text
 */
export function csvHash(text) {
  return createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex");
}

/**
 * @param {SeedRow[]} rows
 * @param {string} hash
 */
export function renderMigration(rows, hash) {
  const json = `[\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]`;
  if (json.includes("$hec$")) throw new Error("CSV contains the dollar-quote tag $hec$");
  const domainCount = rows.reduce((n, r) => n + r.domains.length, 0);
  return [
    "-- Generated by scripts/universities.mjs from supabase/seed/hec_universities.csv. Do not edit;",
    "-- change the CSV and run `node scripts/universities.mjs --write` to add a new sync migration.",
    `-- csv-sha256: ${hash}`,
    `-- universities: ${rows.length}, domains: ${domainCount}`,
    "select private.sync_hec_universities($hec$",
    json,
    "$hec$::jsonb);",
    "",
  ].join("\n");
}

/**
 * The newest sync migration and the CSV hash it was generated from.
 * @returns {{ file: string, hash: string | null } | null}
 */
export function latestSyncMigration(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(SYNC_SUFFIX))
    .sort();
  const file = files.at(-1);
  if (!file) return null;
  const sql = readFileSync(join(dir, file), "utf8");
  const hash = /^-- csv-sha256: ([0-9a-f]{64})$/m.exec(sql)?.[1] ?? null;
  return { file, hash };
}

function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

function main(args) {
  const text = readFileSync(CSV_PATH, "utf8");
  const rows = toSeedRows(parseCsv(text));
  const hash = csvHash(text);
  const latest = latestSyncMigration();

  if (args.includes("--check")) {
    if (latest?.hash !== hash) {
      console.error(
        "supabase/seed/hec_universities.csv changed without a sync migration: run `node scripts/universities.mjs --write`.",
      );
      process.exit(1);
    }
    console.log(`HEC seed in sync (${rows.length} universities, ${latest.file}).`);
    return;
  }

  if (args.includes("--write")) {
    if (latest?.hash === hash) {
      console.log(`Already in sync: ${latest.file}`);
      return;
    }
    const file = join(MIGRATIONS_DIR, `${timestamp()}${SYNC_SUFFIX}`);
    writeFileSync(file, renderMigration(rows, hash));
    console.log(`Wrote ${file} (${rows.length} universities).`);
    return;
  }

  console.error("Usage: node scripts/universities.mjs --write | --check");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
