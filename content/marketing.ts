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

/** Section 3. Each figure was checked against its source on 2026-10-02; recheck before launch. */
export const trustGap = {
  heading: "Anyone can write “React” on a CV.",
  closing: "Skilient shows the work behind every skill, so a recruiter can check it instead of taking it on trust.",
  lead: {
    figure: "70%",
    text: "of workers admit they have lied on their CVs.",
    source: "ResumeLab survey of 1,900 US workers, August 2023, reported by SHRM",
    href: "https://www.shrm.org/in/topics-tools/news/talent-acquisition/are-your-candidates-lying-to-get-the-job",
  },
  rest: [
    {
      figure: "5,000 of 25,000",
      text: "IT graduates a year are hired by Pakistan’s leading IT companies.",
      source: "Gallup Pakistan study, reported by ProPakistani, 15 July 2020",
      href: "https://propakistani.pk/2020/07/15/only-10-of-it-graduates-are-employable-in-pakistan-gallup/",
    },
    {
      figure: "23.9%",
      text: "of women with a master’s degree or higher are unemployed. The national rate is 7.1%.",
      source: "Pakistan Bureau of Statistics, Labour Force Survey 2024-25",
      href: "https://www.pbs.gov.pk/wp-content/uploads/2020/07/LFS-2024-25-Annual-Report.pdf",
    },
  ],
};

/** Section 4. */
export const howItWorks = {
  heading: "How it works",
  steps: [
    { icon: "email", title: "Sign up with your university email", text: "Only students and faculty with a university email can join." },
    { icon: "github", title: "Build ventures with classmates and connect GitHub", text: "Start a project or a startup, fill its open roles, and link the repositories you work in." },
    { icon: "verified", title: "Get verified by your code, your teammates and your faculty", text: "Your commits, your teammates’ confirmations and your faculty’s reviews become verified skills." },
    { icon: "recognised", title: "Get recognised: verified CV, recruiter requests, jobs", text: "Your signed CV grows as you prove more. Recruiters ask before they contact you, and you decide." },
  ] as const,
};

/** Section 5. */
export const feed = {
  heading: "Posts go viral because they provide value, not entertainment.",
  body: "Under each post, readers answer one question with a tick or a cross. Posts that people find informative reach more students. There are no likes.",
  alt: "Two posts in the University Feed (sample posts): one asks the reader “Was this informative?” with a tick and a cross; the other reads “15 people find this interesting”.",
};

/** Section 6. */
export const ventures = {
  heading: "Build in teams of up to six.",
  body: "Every venture lists the roles it needs and the skills for each. Classmates apply with their verified skills, and when the work ships the team posts it as Shipped.",
  alt: "A venture page (sample content): Lab booking for CS students, 4 of 6 members, with open roles for a backend developer and QA.",
  points: [
    { term: "Up to 6 people", detail: "A small team where every contribution is visible." },
    { term: "Open roles", detail: "Each role names the skills it needs, and anyone can apply." },
    { term: "Shipped", detail: "The post that marks the work as done, for everyone to see." },
  ],
};

/** Section 7. Meanings follow PRD 9.3; evidence levels are not explained here (decisions 2026-09-25). */
export const tiers = {
  heading: "Skills you’ve proven, not skills you’ve typed.",
  body: "Your rank comes from verified work alone. Six tiers take you from your first day to an exceptional record.",
  ladder: [
    { id: "raw", name: "Raw", meaning: "Identity verified, no contributions yet" },
    { id: "spark", name: "Spark", meaning: "Your first verified contribution" },
    { id: "flare", name: "Flare", meaning: "Active across projects, endorsements building" },
    { id: "shine", name: "Shine", meaning: "Consistent output, recruiter interest" },
    { id: "radiant", name: "Radiant", meaning: "Top 10% of verified contributors" },
    { id: "luminary", name: "Luminary", meaning: "An exceptional verified record" },
  ] as const,
};

/** Section 8. */
export const verifiedCv = {
  heading: "A CV anyone can check.",
  body: "Every Skilient CV is signed. A recruiter enters its code at skilient.com/verify and sees exactly what we verified, and when.",
  status: "Verified by Skilient",
  caption: "A sample CV. Every real one carries a code like this.",
  alt: "A sample Skilient CV for Ayesha Khan: her tier, a summary, and each verified skill with its evidence.",
  sampleCode: "7KQ2M9XB4D",
  link: "Verify a CV",
};

/** Section 9. */
export const opportunities = {
  heading: "Opportunities come to you.",
  cells: {
    jobs: { title: "Jobs and internships", text: "Every post shows its pay range.", alt: "The Jobs tab (sample posts): a frontend internship and a junior backend role, each with its pay." },
    requests: { title: "Contact requests", text: "Recruiters ask first. You accept or decline.", alt: "A contact request (sample) from a verified company, with Accept and Decline." },
    competitions: { title: "Competitions and hackathons", text: "Company competitions and university hackathons, judged on the work." },
    fairs: { title: "Job fairs", text: "Digital fairs run by your university, with company booths and queues." },
  },
};

/** Section 10. */
export const rules = {
  heading: "Our rules",
  lines: ["Rank can’t be bought.", "Proof is free.", "No ads.", "We never sell your data."],
};

/** Section 11. Until an organisation page ships, its row goes to that audience's signup. */
export const forOrgs = {
  heading: "For organisations",
  rows: [
    { label: "Recruiters", text: "Search verified skills and contact students who choose to be found.", page: "/recruiters" as Route, fallback: "/signup/recruiter" as Route },
    { label: "Universities", text: "Run your campus on Skilient: dashboards, fairs, hackathons and sponsored Pro.", page: "/universities" as Route, fallback: "/signup?role=university_admin" as Route },
    { label: "Faculty", text: "Supervise ventures and confirm your students’ work. Free for faculty.", page: "/faculty" as Route, fallback: "/signup?role=faculty" as Route },
  ],
};

/** Section 12. The price comes from `plans`. */
export const pricingTeaser = {
  heading: "Free is enough to prove yourself.",
  body: "Verification, your rank and tier, your verified CV and being found by recruiters are free, always.",
  pro: "Student Pro",
  perks: ["Refresh your CV any time", "ATS-ready PDF export and more layouts", "See which companies viewed your CV"],
  sponsored: "Free through your university on a Growth or Campus licence.",
  link: "See pricing",
};

/** Section 13. */
export const faq = {
  heading: "Questions",
  items: [
    {
      q: "Who can join?",
      a: "Students and faculty with an email address from a university on Skilient. Recruiters join with a company email, and their company is verified before they can contact anyone.",
    },
    {
      q: "Is it free?",
      a: "Yes. Proving your skills, your rank and tier, your verified CV and being found by recruiters are free. Student Pro adds conveniences such as PDF export and more CV layouts. It never changes your rank.",
    },
    {
      q: "What do you read from my GitHub?",
      a: "Only the repositories you choose when you install the Skilient GitHub App. We read their languages and your own commits and merged pull requests to find the skills you’ve used. For private repositories we never store the code, only commit IDs, file paths and line counts, and the name shows only to you. Disconnecting deletes the repository and commit data.",
    },
    {
      q: "Can my university see my activity?",
      a: "Yes, if your university is on a Growth or Campus plan: its staff can open your student record. Every view is logged, and with Student Pro you can see who viewed it and when. On other plans it never sees individual records; the Basic plan shows only totals for groups of five or more.",
    },
    {
      q: "What happens when I graduate?",
      a: "Your account becomes a graduate account. You keep your profile, CV, skills and evidence, chat and friends, stay visible to recruiters and can still apply to jobs. You can no longer post in your university feed or join university-only ventures.",
    },
    {
      q: "How do recruiters contact me?",
      a: "Through a contact request that names the company and the role. You accept or decline. Only after you accept do they see your name, and you talk in a chat labelled with the company. You choose in Settings whether recruiters can find you at all.",
    },
  ],
};

/** Section 14. */
export const finalCta = {
  heading: "Prove it. Don’t claim it.",
  body: "Join with your university email.",
};
