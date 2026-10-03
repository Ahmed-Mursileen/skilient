import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/lib/analytics/events";
import {
  isHeatmapPage,
  isRecordingBlocked,
  maskAttribute,
  REPLAY_PRIVACY,
  REPLAY_SAMPLE_RATE,
  scrubEvent,
  scrubPath,
  scrubUrl,
  type OutgoingEvent,
} from "@/lib/analytics/privacy";

describe("what PostHog may see (PRD 10)", () => {
  it("keeps origin and path only, and hides names and codes in paths", () => {
    expect(scrubUrl("https://skilient.com/signup?email=amna%40nutech.edu.pk#x")).toBe("https://skilient.com/signup");
    expect(scrubUrl("https://skilient.com/explore?q=amna")).toBe("https://skilient.com/explore");
    expect(scrubUrl("https://skilient.com/profile/amna/skills")).toBe("https://skilient.com/profile/:username/skills");
    expect(scrubUrl("https://skilient.com/cv/amna?t=secret-token")).toBe("https://skilient.com/cv/:username");
    expect(scrubUrl("https://skilient.com/verify/SKL-7F3A-99")).toBe("https://skilient.com/verify/:code");
    expect(scrubUrl("https://skilient.com/verify")).toBe("https://skilient.com/verify");
    expect(scrubUrl("/request-university/confirm?token=abc")).toBe("/request-university/confirm");
    expect(scrubUrl("https://www.google.com/search?q=amna+khan")).toBe("https://www.google.com/search");
    expect(scrubUrl("javascript:alert(1)")).toBeNull();
    expect(scrubPath("/ventures/0d5c/team")).toBe("/ventures/0d5c/team");
  });

  it("never records the PRD's routes, or any page with a secret, token or code", () => {
    for (const path of [
      "/chat",
      "/chat/2b9e",
      "/ventures/2b9e/chat",
      "/settings/billing",
      "/settings/security",
      "/settings/account/delete",
      "/ops",
      "/ops/users/1",
      "/signin",
      "/signin/mfa",
      "/signup",
      "/signup/verify",
      "/forgot-password",
      "/reset-password",
      "/auth/not-me",
      "/billing/checkout/1",
      "/org/billing",
      "/uni/billing",
      "/org/join",
      "/uni/join",
      "/uni/claim",
      "/fairs/invite",
      "/cv/amna",
      "/verify/SKL-1",
      "/request-university/confirm",
      "/request-university/unsubscribe",
      "/events/1/check-in",
      "/events/1/attend",
    ]) {
      expect(isRecordingBlocked(path), path).toBe(true);
    }
    for (const path of ["/", "/feed", "/explore", "/ventures/2b9e/team", "/settings/profile", "/verify", "/chatter", "/opportunities/jobs"]) {
      expect(isRecordingBlocked(path), path).toBe(false);
    }
  });

  it("keeps heatmaps on marketing pages, Home, Opportunities and onboarding only", () => {
    for (const path of ["/", "/recruiters", "/pricing", "/feed", "/opportunities", "/opportunities/jobs", "/onboarding/3"]) {
      expect(isHeatmapPage(path), path).toBe(true);
    }
    for (const path of ["/explore", "/chat", "/post/1", "/opportunities/jobs/1", "/me"]) {
      expect(isHeatmapPage(path), path).toBe(false);
    }
  });

  it("scrubs every event before it leaves the browser", () => {
    const event: OutgoingEvent = {
      event: "$pageview",
      properties: {
        $current_url: "https://skilient.com/signup?email=amna@nutech.edu.pk",
        $pathname: "/profile/amna",
        $referrer: "https://www.google.com/search?q=amna",
        title: "Amna Khan · Skilient",
        source: "hero",
        note: "someone@example.com",
        $set_once: { $initial_current_url: "https://skilient.com/cv/amna?t=tok" },
      },
      $set: { $current_url: "https://skilient.com/explore?q=x" },
    };
    const out = scrubEvent(event, "/feed")!;
    expect(out.properties).toEqual({
      $current_url: "https://skilient.com/signup",
      $pathname: "/profile/:username",
      $referrer: "https://www.google.com/search",
      source: "hero",
      $set_once: { $initial_current_url: "https://skilient.com/cv/:username" },
    });
    expect(out.$set).toEqual({ $current_url: "https://skilient.com/explore" });
  });

  it("sends named events only, whatever a project setting turns on", () => {
    for (const event of ["$autocapture", "$dead_click", "$rageclick", "$exception", "$web_vitals", "$pageleave", "made_up"]) {
      expect(scrubEvent({ event, properties: {} }, "/feed"), event).toBeNull();
    }
    for (const event of ["$pageview", "$identify", "uni_detected", "org_cta_click"]) {
      expect(scrubEvent({ event, properties: {} }, "/feed"), event).not.toBeNull();
    }
  });

  it("drops heatmap data off the heatmap pages and recording data on never-recorded routes", () => {
    expect(scrubEvent({ event: "$$heatmap", properties: {} }, "/explore")).toBeNull();
    const heatmap = scrubEvent(
      { event: "$$heatmap", properties: { $heatmap_data: { "https://skilient.com/?email=a@b.pk": [{ x: 1 }], "https://skilient.com/": [{ x: 2 }] } } },
      "/",
    )!;
    expect(heatmap.properties.$heatmap_data).toEqual({ "https://skilient.com/": [{ x: 1 }, { x: 2 }] });
    expect(scrubEvent({ event: "$snapshot", properties: { $snapshot_data: [] } }, "/chat/1")).toBeNull();

    const snapshot = scrubEvent(
      {
        event: "$snapshot",
        properties: {
          $snapshot_data: [
            { type: 4, data: { href: "https://skilient.com/explore?q=amna", width: 1, height: 1 } },
            { type: 5, data: { tag: "$url_changed", payload: { href: "https://skilient.com/profile/amna" } } },
          ],
        },
      },
      "/explore",
    )!;
    expect(snapshot.properties.$snapshot_data).toEqual([
      { type: 4, data: { href: "https://skilient.com/explore", width: 1, height: 1 } },
      { type: 5, data: { tag: "$url_changed", payload: { href: "https://skilient.com/profile/:username" } } },
    ]);
  });

  it("masks all text and inputs in replays and blocks user images, at a 20% sample", () => {
    expect(REPLAY_PRIVACY.maskAllInputs).toBe(true);
    expect(REPLAY_PRIVACY.maskTextSelector).toBe("*");
    expect(REPLAY_PRIVACY.blockSelector).toContain("/storage/v1/");
    expect(REPLAY_PRIVACY.blockSelector).toContain("[data-ph-block]");
    expect(REPLAY_SAMPLE_RATE).toBe(0.2);
    expect(REPLAY_PRIVACY.slimDOMOptions).toBe("all");
  });

  it("masks text-bearing attributes and scrubs link targets in replays", () => {
    expect(maskAttribute("alt", "Amna Khan's photo")).toBe("**** ****** *****");
    expect(maskAttribute("aria-label", "Open Amna")).toBe("**** ****");
    expect(maskAttribute("content", "Amna Khan · Skilient")).toBe("**** **** * ********");
    expect(maskAttribute("href", "/profile/amna?tab=skills")).toBe("/profile/:username");
    expect(maskAttribute("href", "https://skilient.com/cv/amna?t=tok")).toBe("https://skilient.com/cv/:username");
    expect(maskAttribute("href", "#main")).toBe("#main");
    expect(maskAttribute("href", "mailto:amna@nutech.edu.pk")).toBe("");
    expect(maskAttribute("class", "flex gap-2")).toBe("flex gap-2");
  });
});

describe("event list", () => {
  const dir = "supabase/migrations";
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith("_analytics.sql"))
    .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
    .join("\n");

  /** The top-level arguments of each call to `fn(`, as written. */
  function callArgs(fn: string): string[][] {
    const calls: string[][] = [];
    for (let i = sql.indexOf(`${fn}(`); i !== -1; i = sql.indexOf(`${fn}(`, i + 1)) {
      const args: string[] = [];
      let depth = 0;
      let current = "";
      for (let j = i + fn.length + 1; j < sql.length; j++) {
        const c = sql[j];
        if (c === "(") depth++;
        if (c === ")" && depth-- === 0) break;
        if (c === "," && depth === 0) {
          args.push(current.trim());
          current = "";
        } else current += c;
      }
      args.push(current.trim());
      calls.push(args);
    }
    return calls;
  }

  it("matches the events the database writes, both ways", () => {
    const literal = (arg: string) => /^'([^']+)'$/.exec(arg)?.[1];
    const written = new Set<string>();
    // Calls with a literal event name; the function definitions themselves have `p_event`.
    for (const args of callArgs("private.track")) if (literal(args[1])) written.add(literal(args[1])!);
    for (const args of callArgs("private.track_once")) if (literal(args[2])) written.add(literal(args[2])!);
    expect([...written].sort()).toEqual([...SERVER_EVENTS].sort());
  });

  it("has the five landing events (PRD 5.1) and nothing that overlaps the server's", () => {
    expect([...CLIENT_EVENTS].sort()).toEqual(["org_cta_click", "signup_start", "uni_detected", "uni_not_live", "uni_requested"]);
    for (const event of CLIENT_EVENTS) expect(SERVER_EVENTS as readonly string[]).not.toContain(event);
  });
});
