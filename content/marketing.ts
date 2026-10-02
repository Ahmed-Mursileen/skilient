import type { Route } from "next";

/**
 * Marketing copy (PRD 5.1: copy edits don't touch components). Rules from
 * docs/marketing-design-plan.md: plain sentences, no em-dashes, no hype verbs, only live
 * features, every number with a source. Prices never live here; they come from `plans`.
 */

export interface NavLink {
  label: string;
  href: Route;
}

/**
 * Marketing pages that exist so far. Phase 12 ships in slices and main deploys to production,
 * so nav and footer links to a page appear only once it is built (each slice adds its pages).
 */
export const BUILT_PAGES: ReadonlySet<string> = new Set(["/verify"]);
export const isBuilt = (href: string) => BUILT_PAGES.has(href);

export const nav: { links: NavLink[]; signIn: NavLink; join: NavLink; open: string } = {
  links: [
    { label: "For recruiters", href: "/recruiters" as Route },
    { label: "For universities", href: "/universities" as Route },
    { label: "For faculty", href: "/faculty" as Route },
    { label: "Pricing", href: "/pricing" as Route },
    { label: "Verify a CV", href: "/verify" as Route },
  ],
  signIn: { label: "Sign in", href: "/signin" as Route },
  join: { label: "Join", href: "/signup" as Route },
  open: "Open Skilient",
};

export const hero = {
  headline: "Join Pakistan's first social media platform exclusively for university students.",
  subline: "Build with classmates, prove your skills with real work, and get recognised by recruiters. No more rejected CVs.",
  captureAlt:
    "The University Feed on a phone (sample posts). A reader ticks Informative on a post, its count goes from 11 to 12 people, and the post moves up one place.",
};

/** The university email field (hero and final CTA). `{name}` is the university. */
export const emailField = {
  label: "University email",
  placeholder: "you@university.edu.pk",
  submit: "Join",
  live: "{name} is on Skilient.",
  liveShared: "Your university is on Skilient.",
  personal: "Use your university email.",
  invalid: "Enter a valid email address.",
  notLive: "{name} isn't on Skilient yet.",
  unknown: "We don't recognise this university.",
  request: "Request it",
  signedIn: "Open Skilient",
};

export const requestUniversity = {
  title: "Request your university",
  intro: "Tell us where you study. We count every request, and when your university joins we email you once.",
  email: "University email",
  universityName: "University name",
  universityNameHelp: "We'll match it to the HEC list.",
  consent: "Email me when my university joins.",
  submit: "Send request",
  sent: "Request sent. Check your inbox to confirm your email address.",
  already: "You've already asked for {name}. We'll email you when it joins.",
  rateLimited: "Too many requests from this network. Try again in an hour.",
  confirmed: "Thanks. Your request for {name} is confirmed. We'll email you once, when it joins.",
  unsubscribed: "Done. We won't email you about your university.",
  unsubscribeTitle: "Stop emails about your university",
  unsubscribeIntro: "We'll keep counting your request but won't email you when your university joins.",
  unsubscribeSubmit: "Stop emails",
  badLink: "That link has expired or was already used. Send a new request below.",
};

export const liveAt = {
  heading: "Live at",
  numbers: {
    verified_students: "verified students",
    ventures: "ventures",
    shipped_ventures: "ventures shipped",
  },
};

export const footer = {
  columns: [
    {
      heading: "Skilient",
      links: [
        { label: "About", href: "/about" as Route },
        { label: "Pricing", href: "/pricing" as Route },
        { label: "Verify a CV", href: "/verify" as Route },
      ],
    },
    {
      heading: "For organisations",
      links: [
        { label: "For recruiters", href: "/recruiters" as Route },
        { label: "For universities", href: "/universities" as Route },
        { label: "For faculty", href: "/faculty" as Route },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms", href: "/terms" as Route },
        { label: "Privacy", href: "/privacy" as Route },
      ],
    },
  ],
  /** Hidden until Ahmed confirms the address (decisions 2026-10-02). */
  contactEmail: null as string | null,
  /** Hidden until Ahmed gives the accounts. */
  social: [] as { label: string; href: string; network: "linkedin" | "instagram" | "x" | "facebook" }[],
  theme: "Theme",
  copyright: "© Skilient",
};
