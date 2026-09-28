import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  latestSyncMigration,
  parseTaxonomy,
  renderMigration,
  TAXONOMY_PATH,
  taxonomyHash,
  toSeedRows,
} from "../../scripts/skills.mjs";
import {
  analyseCommit,
  compileTaxonomy,
  duplicateCandidates,
  generatedGlobs,
  globToRegExp,
  isBulkImport,
  isExcludedPath,
  LINE_CAP,
  linguistGlobPatterns,
  linguistSkills,
  type ChangedFile,
  type TaxonomySkill,
} from "@/supabase/functions/_shared/github/detectors";

const text = readFileSync(TAXONOMY_PATH, "utf8");
const { version, skills } = parseTaxonomy(text);
const rows = toSeedRows(skills) as TaxonomySkill[];
const taxonomy = compileTaxonomy(rows);

/** A changed file whose patch adds `added` (the shape GitHub's commit API returns). */
function file(path: string, added: string[] = [], extra: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path,
    status: "modified",
    additions: added.length,
    deletions: 0,
    patch: added.length ? `@@ -0,0 +1,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}` : null,
    ...extra,
  };
}

function detected(files: ChangedFile[]): string[] {
  return [...new Set(analyseCommit(files, taxonomy).detections.map((d) => d.skillId))].sort();
}

describe("skill taxonomy", () => {
  it("is a curated list of about 150 skills in every category, with valid parents", () => {
    expect(version).toBeGreaterThanOrEqual(1);
    expect(skills.length).toBeGreaterThanOrEqual(150);
    for (const category of CATEGORIES) expect(skills.some((s) => s.category === category), category).toBe(true);
    const ids = new Set(skills.map((s) => s.id));
    for (const s of skills) if (s.parent) expect(ids.has(s.parent), `${s.id} → ${s.parent}`).toBe(true);
  });

  it("has fixtures for at least 95% of skills (PRD 5.5 done-when)", () => {
    const covered = skills.filter((s) => (s.examples ?? []).length > 0).length;
    expect(covered / skills.length).toBeGreaterThanOrEqual(0.95);
  });

  it.each(skills.flatMap((s) => (s.examples ?? []).map((e, i) => [`${s.id} #${i + 1} (${e.path})`, s.id, e] as const)))(
    "detects %s",
    (_label, id, example) => {
      expect(detected([file(example.path, example.added ?? ["x"])])).toContain(id);
    },
  );

  it("maps GitHub language stats to language skills", () => {
    expect(linguistSkills(["TypeScript", "PLpgSQL", "Jupyter Notebook", "Brainfuck"], rows).sort()).toEqual([
      "jupyter",
      "sql",
      "typescript",
    ]);
  });

  it("is loaded by the newest sync migration", () => {
    // If this fails: run `pnpm skills:sync` and commit the new migration.
    const latest = latestSyncMigration();
    expect(latest?.hash).toBe(taxonomyHash(text));
    const sql = readFileSync(`supabase/migrations/${latest!.file}`, "utf8");
    expect(sql).toBe(renderMigration(version, toSeedRows(skills), taxonomyHash(text)));
  });

  it("refuses a malformed taxonomy", () => {
    expect(() => parseTaxonomy("version: 1\nskills:\n  - { id: Bad Id, name: X, category: tool, files: [x] }")).toThrow(/slug/);
    expect(() => parseTaxonomy("version: 1\nskills:\n  - { id: a, name: A, category: gadget, files: [x] }")).toThrow(/category/);
    expect(() => parseTaxonomy("version: 1\nskills:\n  - { id: a, name: A, category: tool, parent: b, files: [x] }")).toThrow(/parent/);
    expect(() => parseTaxonomy("version: 1\nskills:\n  - { id: a, name: A, category: tool }")).toThrow(/commit detector/);
    expect(() => parseTaxonomy("version: 1\nskills:\n  - { id: a, name: A, category: tool, files: [x], typo: 1 }")).toThrow(/unknown keys/);
  });
});

describe("detectors: what counts", () => {
  it("counts only added lines, not a framework that merely sits in the repository", () => {
    const touched: ChangedFile = {
      path: "src/App.tsx",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "@@ -1,2 +1,2 @@\n import { useState } from 'react';\n-const a = 1;\n+const a = 2;",
    };
    expect(detected([touched])).toEqual(["typescript"]);
  });

  it("matches package names exactly", () => {
    expect(detected([file("src/x.ts", ["import reactive from 'reactive';"])])).not.toContain("react");
    expect(detected([file("src/x.ts", ["import x from 'react/jsx-runtime';"])])).toContain("react");
    expect(detected([file("app/x.py", ["from djangoproject import thing"])])).not.toContain("django");
    expect(detected([file("app/x.py", ["# import pandas as pd"])])).not.toContain("pandas");
    expect(detected([file("requirements.txt", ["pandas-profiling==3.0"])])).not.toContain("pandas");
    expect(detected([file("requirements-dev.txt", ["Pandas>=2"])])).toContain("pandas");
  });

  it("reads manifests in each ecosystem", () => {
    expect(detected([file("pyproject.toml", ['  "fastapi[standard]>=0.115",'])])).toContain("fastapi");
    expect(detected([file("app/build.gradle.kts", ['  implementation("com.squareup.retrofit2:retrofit:2.11.0")'])])).toContain("retrofit");
    expect(detected([file("Api/Api.csproj", ['    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="9.0.0" />'])])).toContain(
      "entity-framework-core",
    );
    expect(detected([file("composer.json", ['        "laravel/framework": "^11.0",'])])).toContain("laravel");
    expect(detected([file("go.mod", ["\tgithub.com/gin-gonic/gin v1.10.0"])])).toContain("gin");
    expect(detected([file("Gemfile", ["gem 'rails', '~> 8.0'"])])).toContain("rails");
    expect(detected([file("pubspec.yaml", ["  cloud_firestore: ^5.0.0"])])).toContain("firebase");
  });

  it("ignores vendored, built, lock and generated files", () => {
    expect(detected([file("node_modules/react/index.js", ["import x from 'react';"])])).toEqual([]);
    expect(detected([file("dist/app.min.js", ["const x = 1;"])])).toEqual([]);
    expect(detected([file("package-lock.json", ['      "react": "^19.0.0",'])])).toEqual([]);
    expect(detected([file("vendor/laravel/src/App.php", ["<?php"])])).toEqual([]);
    const generated = generatedGlobs("# generated\napi/gen/** linguist-generated=true\n*.pb.go linguist-generated\nsrc/app.ts text");
    expect(isExcludedPath("api/gen/client.ts", generated)).toBe(true);
    expect(isExcludedPath("proto/user.pb.go", generated)).toBe(true);
    expect(isExcludedPath("src/app.ts", generated)).toBe(false);
  });

  it("ignores deleted files", () => {
    expect(detected([file("src/old.ts", ["x"], { status: "removed" })])).toEqual([]);
  });

  it("skips commits touching more than 100 files", () => {
    const files = Array.from({ length: 101 }, (_, i) => file(`src/f${i}.ts`, ["const x = 1;"]));
    expect(analyseCommit(files, taxonomy)).toEqual({ excluded: "too_many_files", meaningfulLines: 0, detections: [] });
  });

  it("skips pure renames and pure reformatting", () => {
    expect(analyseCommit([{ path: "src/new.ts", status: "renamed", additions: 0, deletions: 0 }], taxonomy).excluded).toBe(
      "rename_only",
    );
    const reformat: ChangedFile = {
      path: "src/a.ts",
      status: "modified",
      additions: 2,
      deletions: 1,
      patch: "@@ -1 +1,2 @@\n-const a={b:1,c:2};\n+const a = {\n+b: 1, c: 2 };",
    };
    expect(analyseCommit([reformat], taxonomy).excluded).toBe("formatting_only");
    const realChange = { ...reformat, patch: `${reformat.patch}\n+const d = 3;` };
    expect(analyseCommit([realChange], taxonomy).excluded).toBeNull();
  });

  it("counts non-blank lines in code files only, capped at 400 per commit", () => {
    const small = analyseCommit([file("src/a.ts", ["const a = 1;", "", "   ", "const b = 2;"]), file("README.md", ["# Hi"])], taxonomy);
    expect(small.meaningfulLines).toBe(2);
    const big = analyseCommit(
      [file("src/a.py", Array.from({ length: 600 }, (_, i) => `x${i} = ${i}`)), file("src/b.ts", Array.from({ length: 200 }, () => "f();"))],
      taxonomy,
    );
    expect(big.meaningfulLines).toBe(LINE_CAP);
    const lines = Object.fromEntries(big.detections.filter((d) => d.kind === "lines").map((d) => [d.skillId, d.lines]));
    expect(lines).toEqual({ python: 300, typescript: 100 });
  });

  it("matches globs the way the taxonomy expects", () => {
    expect(globToRegExp("*.tsx").test("src/components/App.tsx")).toBe(true);
    expect(globToRegExp(".github/workflows/*.yml").test(".github/workflows/ci.yml")).toBe(true);
    expect(globToRegExp(".github/workflows/*.yml").test("x/.github/workflows/ci.yml")).toBe(false);
    expect(globToRegExp("**/migrations/**").test("supabase/migrations/2026_init.sql")).toBe(true);
    expect(globToRegExp("**/migrations/**").test("migrations/0001.py")).toBe(true);
    expect(globToRegExp("*.y*ml").test("k8s/api.yaml")).toBe(true);
    expect(globToRegExp("Dockerfile").test("services/api/Dockerfile")).toBe(true);
    expect(globToRegExp("Dockerfile").test("Dockerfile.dev")).toBe(false);
  });

  it("keeps linguist-generated and linguist-vendored globs from .gitattributes", () => {
    expect(linguistGlobPatterns("# x\n/api/gen/** linguist-generated=true\nvendor/ linguist-vendored\nsrc/*.ts text\n")).toEqual([
      "api/gen/**",
      "vendor/**",
    ]);
  });

  it("flags a first commit dumping more than 2,000 lines or 50 files as a bulk import", () => {
    const big = [{ path: "a.py", status: "added", additions: 2001 }];
    expect(isBulkImport(0, big)).toBe(true);
    expect(isBulkImport(1, big)).toBe(false); // not the repository's first commit
    expect(isBulkImport(0, Array.from({ length: 51 }, (_, i) => ({ path: `f${i}.py`, status: "added", additions: 1 })))).toBe(true);
    expect(isBulkImport(0, [{ path: "a.py", status: "added", additions: 2000 }])).toBe(false);
  });

  it("compares only substantial added files across students", () => {
    const blob = (c: string) => c.repeat(40);
    const lines = (n: number) => `@@ -0,0 +1,${n} @@\n` + Array.from({ length: n }, (_, i) => `+x${i} = ${i}`).join("\n");
    const files: ChangedFile[] = [
      { path: "src/solver.py", status: "added", patch: lines(20), sha: blob("a") },
      { path: "LICENSE", status: "added", patch: lines(5), sha: blob("b") }, // too small to mean anything
      { path: "src/edit.py", status: "modified", patch: lines(30), sha: blob("c") }, // not a new file
      { path: "node_modules/x/index.js", status: "added", patch: lines(30), sha: blob("d") }, // vendored
    ];
    expect(duplicateCandidates(files)).toEqual([blob("a")]);
  });
});
