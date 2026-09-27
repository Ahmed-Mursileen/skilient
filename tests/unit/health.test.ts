import { describe, expect, it } from "vitest";
import { runHealthChecks, supabaseChecks } from "@/lib/health";

const ok = async () => {};
const fail = async () => {
  throw new Error("postgres://secret@host");
};

describe("health checks", () => {
  it("is ok when every check passes", async () => {
    const report = await runHealthChecks({ database: ok, storage: ok, realtime: ok });
    expect(report.ok).toBe(true);
    expect(report.checks.database.ok).toBe(true);
  });

  it("is degraded when one check fails, without leaking error details", async () => {
    const report = await runHealthChecks({ database: fail, storage: ok, realtime: ok });
    expect(report.ok).toBe(false);
    expect(report.checks.database).toMatchObject({ ok: false, error: "unavailable" });
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("fails every check when Supabase env is missing", async () => {
    const report = await runHealthChecks(supabaseChecks(null));
    expect(report.ok).toBe(false);
    expect(Object.values(report.checks).every((c) => !c.ok)).toBe(true);
  });
});
