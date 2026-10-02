import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, Input, Label } from "@/components/ui";
import { searchUsers } from "@/lib/data/ops-users";

export const metadata: Metadata = { title: "Users" };

/** /ops/users (PRD 5.26): find an account by name, username, email or GitHub login or id. Any staff role. */
export default async function OpsUsersPage({ searchParams }: PageProps<"/ops/users">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const hits = q.length >= 2 ? await searchUsers(q) : [];
  return (
    <main className="flex flex-col gap-5">
      <h1 className="font-display text-h1">Users</h1>
      <form method="get" action="/ops/users" className="flex flex-wrap items-end gap-2" role="search">
        <div className="flex flex-col gap-2">
          <Label htmlFor="users-q">Name, username, email or GitHub</Label>
          <Input id="users-q" name="q" defaultValue={q} autoComplete="off" maxLength={200} className="w-96" />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {q.length >= 2 ? (
        hits.length ? (
          <div className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
            <table className="w-full min-w-[760px] text-left text-body-sm" data-testid="user-hits">
              <thead className="border-b border-border-default bg-bg-subtle text-caption text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Person</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Role</th>
                  <th scope="col" className="px-3 py-2 font-semibold">University</th>
                  <th scope="col" className="px-3 py-2 font-semibold">GitHub</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {hits.map((u) => (
                  <tr key={u.userId} data-testid="user-hit">
                    <td className="px-3 py-2 align-top">
                      <Link href={`/ops/users/${u.userId}` as Route} className="font-semibold underline underline-offset-4">
                        {u.name}
                      </Link>
                      <span className="block text-caption text-text-secondary">
                        {u.username ? `@${u.username} · ` : ""}
                        {u.email}
                      </span>
                      {u.restriction ? <Badge tone="error" className="mt-1">{u.restriction === "ban" ? "Banned" : "Suspended"}</Badge> : null}
                      {u.status !== "active" ? <Badge className="mt-1 ml-1">{u.status}</Badge> : null}
                    </td>
                    <td className="px-3 py-2 align-top">{u.role}</td>
                    <td className="px-3 py-2 align-top">{u.university ?? "—"}</td>
                    <td className="px-3 py-2 align-top font-mono">{u.githubLogin ?? "—"}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{u.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No accounts found" description="Try part of the name, the full email or the GitHub login." />
        )
      ) : (
        <EmptyState title="Search for an account" description="Type at least two characters." />
      )}
    </main>
  );
}
