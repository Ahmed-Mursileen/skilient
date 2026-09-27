import { afterEach, describe, expect, it } from "vitest";
import { log, logger, requestIdFrom, setLogSink } from "@/lib/log";

let restore: () => void = () => {};
afterEach(() => restore());

describe("JSON logger", () => {
  it("writes one JSON line with request_id and drops undefined fields", () => {
    const lines: string[] = [];
    restore = setLogSink((line) => lines.push(line));
    logger.info("posts.create", { request_id: "r-1", action: "posts.create", duration_ms: 12, outcome: "ok", error_code: undefined });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: "info", msg: "posts.create", request_id: "r-1", duration_ms: 12, outcome: "ok" });
    expect(entry).not.toHaveProperty("error_code");
    expect(typeof entry.ts).toBe("string");
  });

  it("routes levels to the sink", () => {
    const levels: string[] = [];
    restore = setLogSink((_, level) => levels.push(level));
    log("warn", "a");
    log("error", "b");
    expect(levels).toEqual(["warn", "error"]);
  });

  it("reads the request id header", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "abc" }))).toBe("abc");
    expect(requestIdFrom(new Headers())).toBeUndefined();
  });
});
