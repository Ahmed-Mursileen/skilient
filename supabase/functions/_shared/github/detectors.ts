/**
 * Skill detectors (PRD 5.5 "Skill taxonomy and detectors", "What counts as the student's
 * work"). Pure functions over one commit's changed files: they only ever look at lines the
 * commit ADDS and files it adds or changes, so a framework counts only when the student's
 * own commit imports it or adds it to a manifest, never because it's in the repository.
 *
 * The detectors themselves are data (the `skills.detectors` column, generated from
 * lib/github/taxonomy/skills.yaml by scripts/skills.mjs).
 */

export type SkillCategory = "language" | "framework" | "library" | "tool" | "platform" | "practice";

export interface Detectors {
  files?: string[];
  paths?: string[];
  manifests?: { file: string; match: string; flags?: string }[];
  imports?: { ext: string[]; match: string; flags?: string }[];
  linguist?: string[];
}

export interface TaxonomySkill {
  id: string;
  category: SkillCategory;
  detectors: Detectors;
}

/** One file of a commit, as GitHub's commit API returns it. */
export interface ChangedFile {
  path: string;
  status: string; // added | modified | removed | renamed | copied | changed | unchanged
  additions?: number;
  deletions?: number;
  /** Unified diff; GitHub omits it for binary and very large files. */
  patch?: string | null;
  /** Git blob hash of the file after the commit. */
  sha?: string | null;
}

export type DetectionKind = "lines" | "file" | "path" | "manifest" | "import";

export interface Detection {
  skillId: string;
  kind: DetectionKind;
  path: string;
  /** Meaningful lines (languages only; 0 for hits). */
  lines: number;
}

export type Exclusion = "too_many_files" | "rename_only" | "formatting_only";

export interface CommitAnalysis {
  excluded: Exclusion | null;
  /** Added or changed non-blank lines in code files, capped at LINE_CAP. */
  meaningfulLines: number;
  detections: Detection[];
}

/** PRD 5.5: commits touching more than 100 files don't count. */
export const MAX_FILES = 100;
/** PRD 5.5: meaningful lines are capped at 400 per commit. */
export const LINE_CAP = 400;

// --- Globs --------------------------------------------------------------------------

/**
 * `*` stays inside one path segment, `**` crosses segments, `?` is one character. A glob
 * without a slash matches the file name in any folder.
 */
export function globToRegExp(glob: string): RegExp {
  const basenameOnly = !glob.includes("/");
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slashAfter = glob[i + 2] === "/";
      re += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(basenameOnly ? `(?:^|/)${re}$` : `^${re}$`);
}

// --- Exclusions ---------------------------------------------------------------------

const EXCLUDED_DIRS = /(?:^|\/)(?:node_modules|vendor|dist|build|\.next|__pycache__)\//;
const EXCLUDED_FILES = [
  "*.min.*",
  "*.map",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "composer.lock",
  "Cargo.lock",
  "go.sum",
  "pubspec.lock",
  "packages.lock.json",
  "gradle.lockfile",
  "Podfile.lock",
].map(globToRegExp);

/**
 * Vendored, built and lock files never count (PRD 5.5), nor anything the repository marks
 * `linguist-generated` or `linguist-vendored` (passed in as globs).
 */
export function isExcludedPath(path: string, extraGlobs: RegExp[] = []): boolean {
  return EXCLUDED_DIRS.test(path) || EXCLUDED_FILES.some((re) => re.test(path)) || extraGlobs.some((re) => re.test(path));
}

/** Glob patterns from `.gitattributes` lines marking files linguist-generated or linguist-vendored. */
export function linguistGlobPatterns(gitattributes: string): string[] {
  const globs: string[] = [];
  for (const line of gitattributes.split(/\r?\n/)) {
    const [pattern, ...attrs] = line.trim().split(/\s+/);
    if (!pattern || pattern.startsWith("#")) continue;
    const marked = attrs.some((a) => /^linguist-(?:generated|vendored)(?:=true)?$/.test(a));
    if (!marked) continue;
    globs.push(pattern.startsWith("/") ? pattern.slice(1) : pattern.endsWith("/") ? `${pattern}**` : pattern);
  }
  return globs;
}

export function generatedGlobs(gitattributes: string): RegExp[] {
  return linguistGlobPatterns(gitattributes).map(globToRegExp);
}

// --- Patches ------------------------------------------------------------------------

export function addedLines(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) out.push(line.slice(1));
  }
  return out;
}

function removedLines(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("-") && !line.startsWith("---")) out.push(line.slice(1));
  }
  return out;
}

/** The same text in as out once whitespace and line breaks are ignored: a reformat, not new work. */
function isReformat(file: ChangedFile): boolean {
  if (!file.patch) return false;
  const squash = (lines: string[]) => lines.join("").replace(/\s+/g, "");
  const added = squash(addedLines(file.patch));
  return added.length > 0 && added === squash(removedLines(file.patch));
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// --- Taxonomy -----------------------------------------------------------------------

interface CompiledSkill {
  id: string;
  language: boolean;
  files: RegExp[];
  paths: RegExp[];
  manifests: { file: RegExp; match: RegExp }[];
  imports: { ext: Set<string>; match: RegExp }[];
}

export interface CompiledTaxonomy {
  skills: CompiledSkill[];
  /** Globs of every language's files: what counts as a code file. */
  codeFiles: RegExp[];
}

export function compileTaxonomy(skills: TaxonomySkill[]): CompiledTaxonomy {
  const compiled = skills.map((s) => ({
    id: s.id,
    language: s.category === "language",
    files: (s.detectors.files ?? []).map(globToRegExp),
    paths: (s.detectors.paths ?? []).map(globToRegExp),
    manifests: (s.detectors.manifests ?? []).map((m) => ({ file: globToRegExp(m.file), match: new RegExp(m.match, m.flags) })),
    imports: (s.detectors.imports ?? []).map((i) => ({ ext: new Set(i.ext), match: new RegExp(i.match, i.flags) })),
  }));
  return { skills: compiled, codeFiles: compiled.filter((s) => s.language).flatMap((s) => s.files) };
}

function nonBlank(lines: string[]): number {
  return lines.filter((l) => l.trim().length > 0).length;
}

/**
 * Detects the skills in one commit. The caller has already kept only the student's own,
 * non-merge, non-bot commits; this applies the per-commit rules (file count, renames,
 * reformatting), the path exclusions and the 400-line cap.
 */
export function analyseCommit(
  files: ChangedFile[],
  taxonomy: CompiledTaxonomy,
  options: { excludeGlobs?: RegExp[] } = {},
): CommitAnalysis {
  if (files.length > MAX_FILES) return { excluded: "too_many_files", meaningfulLines: 0, detections: [] };
  const live = files.filter((f) => f.status !== "removed" && !isExcludedPath(f.path, options.excludeGlobs));
  if (live.length && live.every((f) => f.status === "renamed" && !f.additions && !f.deletions && !f.patch)) {
    return { excluded: "rename_only", meaningfulLines: 0, detections: [] };
  }
  if (live.length && live.every((f) => f.status !== "added" && isReformat(f))) {
    return { excluded: "formatting_only", meaningfulLines: 0, detections: [] };
  }

  const detections: Detection[] = [];
  let totalLines = 0;
  for (const file of live) {
    const added = addedLines(file.patch);
    const ext = extension(file.path);
    const isCode = taxonomy.codeFiles.some((re) => re.test(file.path));
    // Without a patch (binary or huge), fall back to GitHub's count.
    const lines = isCode ? (file.patch ? nonBlank(added) : (file.additions ?? 0)) : 0;
    totalLines += lines;

    for (const skill of taxonomy.skills) {
      if (skill.files.some((re) => re.test(file.path))) {
        if (skill.language) {
          if (lines > 0) detections.push({ skillId: skill.id, kind: "lines", path: file.path, lines });
        } else {
          detections.push({ skillId: skill.id, kind: "file", path: file.path, lines: 0 });
        }
      }
      if (skill.paths.some((re) => re.test(file.path))) {
        detections.push({ skillId: skill.id, kind: "path", path: file.path, lines: 0 });
      }
      if (added.length && skill.manifests.some((m) => m.file.test(file.path) && added.some((l) => m.match.test(l)))) {
        detections.push({ skillId: skill.id, kind: "manifest", path: file.path, lines: 0 });
      }
      if (added.length && skill.imports.some((i) => i.ext.has(ext) && added.some((l) => i.match.test(l)))) {
        detections.push({ skillId: skill.id, kind: "import", path: file.path, lines: 0 });
      }
    }
  }

  // PRD 5.5: at most 400 meaningful lines per commit, shared out in proportion.
  if (totalLines > LINE_CAP) {
    for (const d of detections) {
      if (d.kind === "lines") d.lines = Math.floor((d.lines * LINE_CAP) / totalLines);
    }
  }
  return { excluded: null, meaningfulLines: Math.min(totalLines, LINE_CAP), detections };
}

/** Skill ids a repository's GitHub language stats point to (L1 "found in your repos"). */
export function linguistSkills(languages: string[], skills: TaxonomySkill[]): string[] {
  const wanted = new Set(languages);
  return skills.filter((s) => (s.detectors.linguist ?? []).some((l) => wanted.has(l))).map((s) => s.id);
}

/**
 * Blob hashes of substantial files a commit ADDS (20+ non-blank lines, not vendored or
 * generated), for the cross-account duplicate check (PRD 5.5). Small shared files
 * (licences, empty __init__.py) would match across students by accident, so they're left out.
 */
export const DUPLICATE_MIN_LINES = 20;

export function duplicateCandidates(files: ChangedFile[], options: { excludeGlobs?: RegExp[] } = {}): string[] {
  return files
    .filter(
      (f) =>
        f.status === "added" &&
        f.sha &&
        /^[0-9a-f]{40}$/.test(f.sha) &&
        !isExcludedPath(f.path, options.excludeGlobs) &&
        nonBlank(addedLines(f.patch)) >= DUPLICATE_MIN_LINES,
    )
    .map((f) => f.sha as string);
}

/** PRD 5.5 "Bulk import": a repository's first commit adding > 2,000 lines or > 50 files. */
export function isBulkImport(parents: number, files: ChangedFile[]): boolean {
  if (parents !== 0) return false;
  const added = files.reduce((n, f) => n + (f.additions ?? 0), 0);
  return added > 2000 || files.length > 50;
}
