import {
  Buildings,
  ChartLine,
  CalendarX,
  ChatText,
  ClipboardText,
  CreditCard,
  Flag,
  GraduationCap,
  IdentificationBadge,
  ListMagnifyingGlass,
  Prohibit,
  Scales,
  SealCheck,
  SlidersHorizontal,
  Tray,
  UserList,
  UsersFour,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/**
 * The ops shell's areas (PRD 5.26, screen spec 3.11): one config for the sidebar and the
 * role checks pages repeat. Client-safe. `roles` lists who sees the area; super admins see
 * everything (staffRoles() expands super_admin into every role).
 */
export type StaffRole = "moderator" | "trust_reviewer" | "accounts" | "super_admin";

export interface OpsArea {
  key: string;
  label: string;
  href: string;
  icon: Icon;
  group: "Work" | "Organisations" | "Platform";
  /** Empty: every staff role. */
  roles: StaffRole[];
  /** Paths that mark the item current; the href itself matches exactly. */
  match: string[];
}

export const OPS_AREAS: OpsArea[] = [
  { key: "inbox", label: "Inbox", href: "/ops", icon: Tray, group: "Work", roles: [], match: [] },
  { key: "reports", label: "Reports", href: "/ops/reports", icon: Flag, group: "Work", roles: ["moderator"], match: ["/ops/reports"] },
  { key: "evidence", label: "Evidence", href: "/ops/evidence", icon: SealCheck, group: "Work", roles: ["trust_reviewer"], match: ["/ops/evidence"] },
  { key: "appeals", label: "Appeals", href: "/ops/appeals", icon: Scales, group: "Work", roles: [], match: ["/ops/appeals"] },
  { key: "sanctions", label: "Sanctions", href: "/ops/sanctions", icon: Prohibit, group: "Work", roles: ["moderator", "accounts"], match: ["/ops/sanctions"] },
  { key: "users", label: "Users", href: "/ops/users", icon: UserList, group: "Work", roles: [], match: ["/ops/users"] },
  { key: "feedback", label: "Feedback", href: "/ops/feedback", icon: ChatText, group: "Work", roles: [], match: ["/ops/feedback"] },
  { key: "teachers", label: "Teachers", href: "/ops/teachers", icon: IdentificationBadge, group: "Organisations", roles: ["accounts", "trust_reviewer"], match: ["/ops/teachers"] },
  { key: "orgs", label: "Organisations", href: "/ops/orgs", icon: Buildings, group: "Organisations", roles: ["accounts"], match: ["/ops/orgs"] },
  { key: "universities", label: "Universities", href: "/ops/universities", icon: GraduationCap, group: "Organisations", roles: ["accounts", "moderator"], match: ["/ops/universities"] },
  { key: "exam-periods", label: "Exam periods", href: "/ops/exam-periods", icon: CalendarX, group: "Organisations", roles: ["accounts"], match: ["/ops/exam-periods"] },
  { key: "graduation", label: "Graduation", href: "/ops/graduation", icon: ClipboardText, group: "Organisations", roles: ["accounts"], match: ["/ops/graduation"] },
  { key: "billing", label: "Billing", href: "/ops/billing", icon: CreditCard, group: "Organisations", roles: ["accounts"], match: ["/ops/billing"] },
  { key: "staff", label: "Staff", href: "/ops/staff", icon: UsersFour, group: "Platform", roles: ["super_admin"], match: ["/ops/staff"] },
  { key: "config", label: "Config", href: "/ops/config", icon: SlidersHorizontal, group: "Platform", roles: [], match: ["/ops/config"] },
  { key: "metrics", label: "Metrics", href: "/ops/metrics", icon: ChartLine, group: "Platform", roles: [], match: ["/ops/metrics"] },
  { key: "audit", label: "Audit log", href: "/ops/audit", icon: ListMagnifyingGlass, group: "Platform", roles: [], match: ["/ops/audit"] },
];

export const OPS_GROUPS = ["Work", "Organisations", "Platform"] as const;

export function canOpen(area: OpsArea, roles: ReadonlySet<StaffRole> | readonly StaffRole[]): boolean {
  const has = (r: StaffRole) => (roles instanceof Set ? roles.has(r) : (roles as readonly StaffRole[]).includes(r));
  return area.roles.length === 0 || area.roles.some(has);
}

export function isCurrent(area: OpsArea, pathname: string): boolean {
  return pathname === area.href || area.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  moderator: "Moderator",
  trust_reviewer: "Trust reviewer",
  accounts: "Accounts",
  super_admin: "Super admin",
};
export const STAFF_ROLES = ["moderator", "trust_reviewer", "accounts", "super_admin"] as const satisfies readonly StaffRole[];

/** The inbox's queues: label, and the area page that lists them in full. */
export const QUEUE_LABELS: Record<string, string> = {
  reports: "Reports",
  credentials: "Credentials",
  github_flags: "GitHub activity flags",
  code_checks: "Code-check fallbacks",
  ranking_flags: "Ranking flags",
  teachers: "Teacher requests",
  orgs: "Recruiter verification",
  uni_claims: "University claims",
  uni_domains: "University domain requests",
  billing_tasks: "Billing tasks",
  feedback: "Feedback",
  appeals: "Appeals",
};
