import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, stripQuery } from "@/lib/sentry-scrub";

describe("Sentry scrubbing", () => {
  it("strips query strings", () => {
    expect(stripQuery("https://x.dev/search?q=ayesha&token=1")).toBe("https://x.dev/search");
    expect(stripQuery("/feed")).toBe("/feed");
  });

  it("removes personal data from events and keeps only the user uuid", () => {
    const event = {
      type: undefined,
      message: "failed for ayesha@nust.edu.pk",
      user: { id: "u-1", email: "ayesha@nust.edu.pk", username: "ayesha" },
      request: {
        url: "https://skilient.pk/chat/1?draft=hi",
        query_string: "draft=hi",
        data: { body: "secret message" },
        cookies: { sb: "token" },
        headers: { "user-agent": "UA", cookie: "sb=token", "x-request-id": "r-1" },
      },
      exception: { values: [{ type: "Error", value: "no user bilal@fast.edu.pk" }] },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: "u-1" });
    expect(out.request?.url).toBe("https://skilient.pk/chat/1");
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.headers).toEqual({ "user-agent": "UA", "x-request-id": "r-1" });
    expect(out.message).toBe("failed for [email]");
    expect(out.exception?.values?.[0].value).toBe("no user [email]");
  });

  it("drops console and UI breadcrumbs and strips navigation queries", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.click", message: "x" })).toBeNull();
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/a?x=1", to: "/b?y=2" } })?.data).toEqual({ from: "/a", to: "/b" });
  });
});
