import { Bell, CaretRight, Certificate, ChatsCircle, GithubLogo, ShieldCheck, UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Settings" };

const sections = [
  { href: "/settings/profile", title: "Profile", description: "Name, photo, bio, department and who can see your profile.", icon: UserCircle },
  { href: "/settings/github", title: "GitHub", description: "Connect GitHub, choose repositories, resync or disconnect.", icon: GithubLogo },
  { href: "/me/credentials", title: "Credentials", description: "Certificates you've added and their review status.", icon: Certificate },
  { href: "/settings/notifications", title: "Notifications", description: "Which notifications also reach your email, and how often.", icon: Bell },
  { href: "/settings/chat", title: "Chat", description: "Read receipts in direct messages.", icon: ChatsCircle },
  { href: "/settings/security", title: "Security", description: "Two-factor, signed-in devices and recent account activity.", icon: ShieldCheck },
] as const;

export default function SettingsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[var(--page-gutter)] py-8">
      <h1 className="font-display text-h1">Settings</h1>
      <ul className="divide-y divide-border-muted overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        {sections.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href as Route} className="flex items-center gap-4 px-5 py-4 hover:bg-bg-subtle">
              <Icon aria-hidden weight="bold" className="size-6 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-h4">{title}</span>
                <span className="block text-body-sm text-text-secondary">{description}</span>
              </span>
              <CaretRight aria-hidden weight="bold" className="size-4 shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
