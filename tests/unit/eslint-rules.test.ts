import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId);
}

describe("project ESLint guards", () => {
  it("blocks the service-role client outside allowed folders", async () => {
    const code = `import { createServiceClient } from "@/lib/supabase/service";\nexport const c = createServiceClient;\n`;
    expect(await ruleIds(code, "app/feed/page.tsx")).toContain("no-restricted-imports");
    expect(await ruleIds(code, "lib/actions/posts.ts")).toContain("no-restricted-imports");
    expect(await ruleIds(code, "lib/jobs/ranking.ts")).not.toContain("no-restricted-imports");
    expect(await ruleIds(code, "app/api/webhooks/github/route.ts")).not.toContain("no-restricted-imports");
  });

  it("blocks reading the service-role key anywhere but lib/supabase/service.ts", async () => {
    const code = `export const k = process.env.SUPABASE_SERVICE_ROLE_KEY;\n`;
    expect(await ruleIds(code, "lib/actions/x.ts")).toContain("no-restricted-syntax");
    expect(await ruleIds(code, "lib/jobs/x.ts")).toContain("no-restricted-syntax");
    expect(await ruleIds(code, "lib/supabase/service.ts")).not.toContain("no-restricted-syntax");
  });

  it("blocks getSession()", async () => {
    const code = `declare const supabase: { auth: { getSession(): Promise<unknown> } };\nexport const s = supabase.auth.getSession();\n`;
    expect(await ruleIds(code, "lib/data/profile.ts")).toContain("no-restricted-syntax");
  });

  it("blocks raw fetch to Supabase REST", async () => {
    const code = "declare const base: string;\nexport const r = fetch(`${base}/rest/v1/profiles`);\n";
    expect(await ruleIds(code, "lib/data/x.ts")).toContain("no-restricted-syntax");
  });

  it("allows getUser()", async () => {
    const code = `declare const supabase: { auth: { getUser(): Promise<unknown> } };\nexport const u = supabase.auth.getUser();\n`;
    expect(await ruleIds(code, "lib/data/profile.ts")).toEqual([]);
  });
});
