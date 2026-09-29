/**
 * Code-check snippets (PRD 5.5 "Code check"): where in a commit the student's own added lines
 * run for long enough, and the lines of a file at that commit. Pure functions, web APIs only,
 * shared by the github-worker (picking) and the code-check Edge Function (showing).
 */

export interface LineRun {
  /** 1-based line numbers in the file after the commit. */
  start: number;
  end: number;
}

/**
 * Runs of consecutive added lines in a unified diff, numbered as in the new file. A context or
 * removed line ends a run; "\ No newline" markers are ignored.
 */
export function addedRuns(patch: string | null | undefined): LineRun[] {
  if (!patch) return [];
  const runs: LineRun[] = [];
  let line = 0;
  let open: LineRun | null = null;
  const close = () => {
    if (open) runs.push(open);
    open = null;
  };
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      close();
      line = Number(hunk[1]);
      continue;
    }
    if (!line || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) {
      if (open && open.end === line - 1) open.end = line;
      else {
        close();
        open = { start: line, end: line };
      }
      line++;
    } else if (raw.startsWith("-")) {
      close();
    } else {
      close();
      line++;
    }
  }
  close();
  return runs;
}

/**
 * A window of `min`..`max` lines inside one of the runs long enough, chosen with `random`
 * (0 <= r < 1). Null when no run reaches `min` lines.
 */
export function pickWindow(runs: LineRun[], min: number, max: number, random: () => number): LineRun | null {
  const long = runs.filter((r) => r.end - r.start + 1 >= min);
  if (!long.length) return null;
  const run = long[Math.floor(random() * long.length) % long.length];
  const length = Math.min(max, run.end - run.start + 1);
  const slack = run.end - run.start + 1 - length;
  const start = run.start + Math.floor(random() * (slack + 1)) % (slack + 1);
  return { start, end: start + length - 1 };
}

/** Lines `start`..`end` (1-based, inclusive) of a file's text. */
export function sliceLines(text: string, start: number, end: number): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(Math.max(0, start - 1), Math.max(0, end));
}

/** GitHub's contents API sends file text as base64 with line breaks. */
export function decodeBase64(content: string): string {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
