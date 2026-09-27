import { describe, expect, it } from "vitest";
import { HealthError, runHealthChecks, supabaseChecks } from "@/lib/health";
import { setLogSink } from "@/lib/log";

setLogSink(() => {});

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

  it("reports a HealthError's safe code, not its detail", async () => {
    const report = await runHealthChecks({
      database: ok,
      storage: async () => {
        throw new HealthError("http_404", "upstream said secret-thing");
      },
      realtime: ok,
    });
    expect(report.checks.storage).toMatchObject({ ok: false, error: "http_404" });
    expect(JSON.stringify(report)).not.toContain("secret-thing");
  });

  it("fails every check when Supabase env is missing", async () => {
    const report = await runHealthChecks(supabaseChecks(null));
    expect(report.ok).toBe(false);
    expect(Object.values(report.checks).every((c) => !c.ok && c.error === "env_missing")).toBe(true);
  });
});
