/**
 * AI coding agents (decisions 2026-10-03, PRD 5.5): which commits an agent wrote. The identities
 * come from platform_config `github.ai_agents` ("match" is a git author email or a GitHub login,
 * compared case-insensitively). Pure: no database, no network.
 */

export interface AgentIdentity {
  match: string;
  name: string;
}

/** The parts of a GitHub commit this needs (the commits API's shape). */
export interface AgentCommit {
  /** The GitHub account the commit's author email is linked to, if any. */
  author: { id: number; login?: string; type?: string } | null;
  commit: { author: { email?: string | null; name?: string | null } | null };
}

/**
 * The agent identity that authored `commit`, lower case, or null. A commit GitHub links to an
 * account counts only when that account's login is an agent (so a person's commit never does,
 * whatever its email says); an unlinked one only when its git author email is an agent's.
 */
export function agentAuthor(commit: AgentCommit, agents: AgentIdentity[]): string | null {
  const known = new Set(agents.map((a) => a.match.trim().toLowerCase()).filter(Boolean));
  if (commit.author) {
    const login = commit.author.login?.toLowerCase();
    return login && known.has(login) ? login : null;
  }
  const email = commit.commit.author?.email?.trim().toLowerCase();
  return email && known.has(email) ? email : null;
}

/** platform_config's value, defensively: anything malformed is dropped. */
export function parseAgents(value: unknown): AgentIdentity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a) =>
    a && typeof a === "object" && typeof (a as AgentIdentity).match === "string" && typeof (a as AgentIdentity).name === "string"
      ? [{ match: (a as AgentIdentity).match, name: (a as AgentIdentity).name }]
      : [],
  );
}
