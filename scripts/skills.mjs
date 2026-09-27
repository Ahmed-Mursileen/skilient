#!/usr/bin/env node
/**
 * Skill taxonomy (PRD 5.5). lib/github/taxonomy/skills.yaml is the source of truth; this
 * script validates it, expands its ecosystem shorthands into plain detectors, and writes a
 * data migration that calls private.sync_skills(), so `supabase db push` carries the
 * taxonomy to the hosted project. The github-worker reads the expanded detectors from the
 * `skills` table and runs them with supabase/functions/_shared/github/detectors.ts.
 *
 *   node scripts/skills.mjs --write   # after editing the YAML: adds a new sync migration
 *   node scripts/skills.mjs --check   # exits 1 if the YAML changed without a migration
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TAXONOMY_PATH = join(ROOT, "lib/github/taxonomy/skills.yaml");
export const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const SYNC_SUFFIX = "_sync_skills_taxonomy.sql";

export const CATEGORIES = ["language", "framework", "library", "tool", "platform", "practice"];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SHORTHANDS = ["npm", "pypi", "maven", "jvm", "nuget", "composer", "php_ns", "go", "gem", "pub"];
const KNOWN_KEYS = new Set(["id", "name", "category", "parent", "linguist", "files", "paths", "imports", "manifests", "examples", ...SHORTHANDS]);

/**
 * @typedef {{ file: string, match: string, flags?: string }} ManifestDetector
 * @typedef {{ ext: string[], match: string, flags?: string }} ImportDetector
 * @typedef {{ files?: string[], paths?: string[], manifests?: ManifestDetector[], imports?: ImportDetector[], linguist?: string[] }} Detectors
 * @typedef {{ path: string, added?: string[] }} Example
 * @typedef {{ id: string, name: string, category: string, parent?: string, examples?: Example[] } & Record<string, unknown>} RawSkill
 * @typedef {{ id: string, name: string, category: string, parent: string | null, detectors: Detectors }} SkillRow
 */

const JS_EXT = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "vue", "svelte", "astro"];
const PY_EXT = ["py", "pyw", "ipynb"];
const JVM_EXT = ["java", "kt", "kts", "scala", "groovy"];
const PY_MANIFESTS = ["requirements*.txt", "**/requirements/*.txt", "pyproject.toml", "Pipfile", "setup.py", "setup.cfg", "environment.yml"];

/** @param {string} s */
export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function strings(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v)) throw new Error("expected a list of strings");
  return /** @type {string[]} */ (value);
}

/** npm: exact package (subpaths allowed) or a scope prefix ending in "/". @param {string} p */
function npmPackage(p) {
  return p.endsWith("/") ? `${escapeRe(p)}[^'"\`]+` : `${escapeRe(p)}(?:/[^'"\`]*)?`;
}

/** PyPI names compare with -, _ and . as one; "*" suffix is a prefix. @param {string} p */
function pypiName(p) {
  const prefix = p.endsWith("*");
  const body = escapeRe(prefix ? p.slice(0, -1) : p).replace(/\\\.|[-_]/g, "[-_.]");
  return prefix ? `${body}[a-z0-9._-]+` : body;
}

/**
 * Expands one YAML entry into plain detectors.
 * @param {RawSkill} skill
 * @returns {Detectors}
 */
export function expandDetectors(skill) {
  /** @type {ManifestDetector[]} */
  const manifests = [];
  /** @type {ImportDetector[]} */
  const imports = [];
  const alt = (/** @type {string[]} */ parts) => `(?:${parts.join("|")})`;

  const npm = strings(skill.npm);
  if (npm.length) {
    manifests.push({
      file: "package.json",
      match: `^\\s*"${alt(npm.map((p) => (p.endsWith("/") ? `${escapeRe(p)}[^"]+` : escapeRe(p))))}"\\s*:`,
    });
    imports.push({
      ext: JS_EXT,
      match: `(?:\\bfrom\\s*|\\brequire\\(\\s*|\\bimport\\(\\s*|^\\s*import\\s+)['"\`]${alt(npm.map(npmPackage))}['"\`]`,
    });
  }

  const pypi = /** @type {unknown[]} */ (skill.pypi ?? []);
  if (pypi.length) {
    const entries = pypi.map((e) =>
      typeof e === "string" ? { package: e, module: e } : /** @type {{ package: string, module: string }} */ (e),
    );
    if (entries.some((e) => !e.package || !e.module)) throw new Error("pypi entries need package and module");
    const names = alt(entries.map((e) => pypiName(e.package)));
    for (const file of PY_MANIFESTS) {
      manifests.push({
        file,
        match: `(?:^|[\\s"'\\[,(])${names}(?:\\[[^\\]]*\\])?\\s*(?:[<>=!~;,"')\\]]|$)`,
        flags: "i",
      });
    }
    const modules = alt([...new Set(entries.map((e) => escapeRe(e.module)))]);
    imports.push({
      ext: PY_EXT,
      match: `^\\s*"?(?:from\\s+${modules}(?:\\.[\\w.]+)?\\s+import\\b|import\\s+${modules}(?:\\.[\\w.]+)?\\b)`,
    });
  }

  const maven = strings(skill.maven);
  if (maven.length) {
    const coords = alt(maven.map(escapeRe));
    manifests.push({ file: "pom.xml", match: `<(?:groupId|artifactId)>\\s*${coords}` });
    for (const file of ["build.gradle", "build.gradle.kts", "libs.versions.toml"]) {
      manifests.push({ file, match: `["'](?:[\\w.-]+:)?${coords}` });
    }
  }
  const jvm = strings(skill.jvm);
  if (jvm.length) {
    imports.push({ ext: JVM_EXT, match: `^\\s*import\\s+(?:static\\s+)?${alt(jvm.map(escapeRe))}\\.` });
  }

  const nuget = strings(skill.nuget);
  if (nuget.length) {
    const ns = alt(nuget.map(escapeRe));
    for (const file of ["*.csproj", "*.fsproj", "packages.config", "Directory.Packages.props"]) {
      manifests.push({ file, match: `Include="${ns}` });
    }
    imports.push({ ext: ["cs", "razor"], match: `^\\s*(?:global\\s+)?using\\s+(?:static\\s+)?${ns}` });
  }

  const composer = strings(skill.composer);
  if (composer.length) {
    manifests.push({
      file: "composer.json",
      match: `"${alt(composer.map((c) => (c.endsWith("/") ? `${escapeRe(c)}[^"]+` : escapeRe(c))))}"\\s*:`,
    });
  }
  const phpNs = strings(skill.php_ns);
  if (phpNs.length) {
    imports.push({ ext: ["php"], match: `^\\s*use\\s+\\\\?${alt(phpNs.map(escapeRe))}\\\\` });
  }

  const go = strings(skill.go);
  if (go.length) {
    const mods = alt(go.map(escapeRe));
    manifests.push({ file: "go.mod", match: `^\\s*(?:require\\s+)?${mods}(?:/\\S*)?\\s+v\\d` });
    imports.push({ ext: ["go"], match: `"${mods}(?:/[^"]*)?"` });
  }

  const gem = strings(skill.gem);
  if (gem.length) {
    const gems = alt(gem.map(escapeRe));
    for (const file of ["Gemfile", "*.gemspec"]) manifests.push({ file, match: `\\b(?:gem|add_dependency)\\s+["']${gems}["']` });
    imports.push({ ext: ["rb"], match: `\\brequire\\s+["']${gems}["']` });
  }

  const pub = strings(skill.pub);
  if (pub.length) {
    const pkgs = alt(pub.map(escapeRe));
    manifests.push({ file: "pubspec.yaml", match: `^\\s{2,}${pkgs}\\s*:` });
    imports.push({ ext: ["dart"], match: `import\\s+["']package:${pkgs}/` });
  }

  for (const m of /** @type {ManifestDetector[]} */ (skill.manifests ?? [])) manifests.push(m);
  for (const i of /** @type {ImportDetector[]} */ (skill.imports ?? [])) imports.push(i);

  /** @type {Detectors} */
  const detectors = {};
  const files = strings(skill.files);
  const paths = strings(skill.paths);
  const linguist = strings(skill.linguist);
  if (files.length) detectors.files = files;
  if (paths.length) detectors.paths = paths;
  if (manifests.length) detectors.manifests = manifests;
  if (imports.length) detectors.imports = imports;
  if (linguist.length) detectors.linguist = linguist;
  return detectors;
}

/**
 * Parses and validates the taxonomy.
 * @param {string} text
 * @returns {{ version: number, skills: RawSkill[] }}
 */
export function parseTaxonomy(text) {
  const doc = parse(text);
  if (!Number.isInteger(doc?.version) || doc.version < 1) throw new Error("taxonomy needs an integer version");
  if (!Array.isArray(doc.skills)) throw new Error("taxonomy needs a skills list");
  /** @type {RawSkill[]} */
  const skills = doc.skills;
  const ids = new Set();
  for (const s of skills) {
    const where = `skill ${s?.id ?? "?"}`;
    if (!ID_RE.test(s?.id ?? "")) throw new Error(`${where}: id must be a lower-case slug`);
    if (ids.has(s.id)) throw new Error(`${where}: duplicate id`);
    ids.add(s.id);
    if (typeof s.name !== "string" || !s.name || s.name.length > 60) throw new Error(`${where}: name is required (≤ 60)`);
    if (!CATEGORIES.includes(s.category)) throw new Error(`${where}: unknown category ${s.category}`);
    const unknown = Object.keys(s).filter((k) => !KNOWN_KEYS.has(k));
    if (unknown.length) throw new Error(`${where}: unknown keys ${unknown.join(", ")}`);
  }
  for (const s of skills) {
    if (s.parent !== undefined && !ids.has(s.parent)) throw new Error(`skill ${s.id}: parent ${s.parent} doesn't exist`);
    if (s.parent === s.id) throw new Error(`skill ${s.id}: can't be its own parent`);
    const d = expandDetectors(s);
    if (!d.files && !d.paths && !d.manifests && !d.imports) throw new Error(`skill ${s.id}: needs at least one commit detector`);
    for (const r of [...(d.manifests ?? []), ...(d.imports ?? [])]) {
      try {
        new RegExp(r.match, r.flags);
      } catch (error) {
        throw new Error(`skill ${s.id}: bad regex ${r.match}: ${/** @type {Error} */ (error).message}`);
      }
    }
  }
  return { version: doc.version, skills };
}

/**
 * @param {RawSkill[]} skills
 * @returns {SkillRow[]}
 */
export function toSeedRows(skills) {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    parent: s.parent ?? null,
    detectors: expandDetectors(s),
  }));
}

/** @param {string} text */
export function taxonomyHash(text) {
  return createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex");
}

/**
 * @param {number} version
 * @param {SkillRow[]} rows
 * @param {string} hash
 */
export function renderMigration(version, rows, hash) {
  const json = `[\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]`;
  if (json.includes("$tax$")) throw new Error("taxonomy contains the dollar-quote tag $tax$");
  return [
    "-- Generated by scripts/skills.mjs from lib/github/taxonomy/skills.yaml. Do not edit;",
    "-- change the YAML and run `pnpm skills:sync` to add a new sync migration.",
    `-- taxonomy-sha256: ${hash}`,
    `-- taxonomy version ${version}: ${rows.length} skills`,
    `select private.sync_skills(${version}, $tax$`,
    json,
    "$tax$::jsonb);",
    "",
  ].join("\n");
}

/**
 * The newest taxonomy sync migration and the YAML hash it was generated from.
 * @returns {{ file: string, hash: string | null } | null}
 */
export function latestSyncMigration(dir = MIGRATIONS_DIR) {
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(SYNC_SUFFIX))
    .sort()
    .at(-1);
  if (!file) return null;
  const sql = readFileSync(join(dir, file), "utf8");
  return { file, hash: /^-- taxonomy-sha256: ([0-9a-f]{64})$/m.exec(sql)?.[1] ?? null };
}

function timestamp(date = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

/** @param {string[]} args */
function main(args) {
  const text = readFileSync(TAXONOMY_PATH, "utf8");
  const { version, skills } = parseTaxonomy(text);
  const rows = toSeedRows(skills);
  const hash = taxonomyHash(text);
  const latest = latestSyncMigration();

  if (args.includes("--check")) {
    if (latest?.hash !== hash) {
      console.error("lib/github/taxonomy/skills.yaml changed without a sync migration: run `pnpm skills:sync`.");
      process.exit(1);
    }
    console.log(`Skill taxonomy in sync (${rows.length} skills, ${latest.file}).`);
    return;
  }
  if (args.includes("--write")) {
    if (latest?.hash === hash) {
      console.log(`Already in sync: ${latest.file}`);
      return;
    }
    const file = join(MIGRATIONS_DIR, `${timestamp()}${SYNC_SUFFIX}`);
    writeFileSync(file, renderMigration(version, rows, hash));
    console.log(`Wrote ${file} (${rows.length} skills).`);
    return;
  }
  console.error("Usage: node scripts/skills.mjs --write | --check");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
