import {
  CalendarBlank,
  Bell,
  Briefcase,
  ChatCircleDots,
  ChatsCircle,
  House,
  Medal,
  MagnifyingGlass,
  RocketLaunch,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/**
 * The student shell's navigation (PRD 5.25, screen spec 2): one config for the sidebar, the
 * tablet rail, the phone tab bar and the tooltips (label plus a one-line description, PRD
 * 5.27). `data-tour` ids tie each item to its coach mark. Client-safe: no server code.
 */
export type BadgeKey = "chat" | "notifications" | "friends" | "ventures" | "opportunities";
export type NavBadges = Record<BadgeKey, number>;
export const NO_BADGES: NavBadges = { chat: 0, notifications: 0, friends: 0, ventures: 0, opportunities: 0 };

export interface NavItem {
  key: string;
  label: string;
  /** The tooltip's one line (also read by screen readers through aria-describedby). */
  description: string;
  href: string;
  icon: Icon;
  badge?: BadgeKey;
  /** Path prefixes that count as being on this item. */
  match: string[];
}

/** The five areas: the phone's bottom tabs and the top of the sidebar. */
export const PRIMARY_NAV: NavItem[] = [
  { key: "home", label: "Home", description: "Your feed, your progress and the composer.", href: "/feed", icon: House, match: ["/feed", "/post"] },
  {
    key: "opportunities",
    label: "Opportunities",
    description: "Jobs, requests, competitions and events matched to your skills.",
    href: "/opportunities/for_you",
    icon: Briefcase,
    badge: "opportunities",
    match: ["/opportunities"],
  },
  {
    key: "ventures",
    label: "Ventures",
    description: "Projects you build with others.",
    href: "/ventures",
    icon: RocketLaunch,
    badge: "ventures",
    match: ["/ventures", "/requests"],
  },
  {
    key: "chat",
    label: "Chat",
    description: "Messages with friends, teammates and recruiters.",
    href: "/chat",
    icon: ChatsCircle,
    badge: "chat",
    match: ["/chat"],
  },
  {
    key: "me",
    label: "Me",
    description: "Your profile, skills, CV and score.",
    href: "/me",
    icon: UserCircle,
    match: ["/me", "/profile", "/settings", "/feedback"],
  },
];

/** Below the areas on the sidebar; on a phone they live in the top bar or inside Me. */
export const SECONDARY_NAV: NavItem[] = [
  { key: "explore", label: "Explore", description: "Find people, ventures and skills.", href: "/explore", icon: MagnifyingGlass, match: ["/explore"] },
  { key: "leaderboard", label: "Leaderboard", description: "Where you stand at your university and overall.", href: "/leaderboard", icon: Medal, match: ["/leaderboard"] },
  { key: "events", label: "Events", description: "Talks, workshops and fairs at your university and beyond.", href: "/events", icon: CalendarBlank, match: ["/events", "/u", "/fairs"] },
  { key: "friends", label: "Friends", description: "Your friends and their requests.", href: "/friends", icon: UsersThree, badge: "friends", match: ["/friends"] },
  { key: "notifications", label: "Notifications", description: "What happened since you were last here.", href: "/notifications", icon: Bell, badge: "notifications", match: ["/notifications"] },
  { key: "feedback", label: "Feedback", description: "Tell us what is confusing or broken.", href: "/feedback", icon: ChatCircleDots, match: ["/feedback"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  // Feedback sits under Me on a phone but has its own sidebar item: the more specific wins.
  if (item.key === "me" && pathname.startsWith("/feedback")) return false;
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}
