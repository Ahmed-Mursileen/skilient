import { describe, expect, it } from "vitest";
import { agentAuthor, parseAgents } from "@/supabase/functions/_shared/github/agents.ts";

const AGENTS = parseAgents([
  { match: "noreply@anthropic.com", name: "Claude" },
  { match: "claude", name: "Claude" },
  { match: "Copilot-SWE-Agent[bot]", name: "GitHub Copilot" },
  { match: 42, name: "broken" },
  "nope",
]);
const commit = (author: { id: number; login?: string } | null, email: string | null) => ({ author, commit: { author: { email, name: "x" } } });

describe("AI agent commits", () => {
  it("drops malformed config entries", () => {
    expect(AGENTS.map((a) => a.match)).toEqual(["noreply@anthropic.com", "claude", "Copilot-SWE-Agent[bot]"]);
    expect(parseAgents(null)).toEqual([]);
  });

  it("matches an unlinked commit by its git author email, ignoring case", () => {
    expect(agentAuthor(commit(null, "NoReply@Anthropic.com"), AGENTS)).toBe("noreply@anthropic.com");
    expect(agentAuthor(commit(null, "someone@example.com"), AGENTS)).toBeNull();
    expect(agentAuthor(commit(null, null), AGENTS)).toBeNull();
  });

  it("matches a linked commit only by the agent account's login", () => {
    expect(agentAuthor(commit({ id: 81847, login: "claude" }, "noreply@anthropic.com"), AGENTS)).toBe("claude");
    expect(agentAuthor(commit({ id: 1, login: "copilot-swe-agent[bot]" }, null), AGENTS)).toBe("copilot-swe-agent[bot]");
    // A person's account never counts, whatever email the commit carries.
    expect(agentAuthor(commit({ id: 4242, login: "mallory" }, "noreply@anthropic.com"), AGENTS)).toBeNull();
    expect(agentAuthor(commit({ id: 4242 }, "noreply@anthropic.com"), AGENTS)).toBeNull();
  });

  it("matches nothing without a configured list", () => {
    expect(agentAuthor(commit(null, "noreply@anthropic.com"), [])).toBeNull();
  });
});
