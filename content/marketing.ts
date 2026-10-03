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
export const BUILT_PAGES: ReadonlySet<string> = new Set(["/verify", "/recruiters", "/universities", "/faculty", "/pricing", "/about", "/terms", "/privacy"]);
/** Built but kept out of search until their final text exists. */
export const NOINDEX_PAGES: ReadonlySet<string> = new Set(["/terms", "/privacy"]);
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

// ---------------------------------------------------------------------------------------------
// Organisation pages, pricing and about (slice 3). Plan names, prices and limits come from
// `plans` and `platform_config`; the copy below never repeats a number billing enforces.
// ---------------------------------------------------------------------------------------------

/** /recruiters (PRD 5.1, 5.20). */
export const recruitersPage = {
  title: "For recruiters",
  description: "Search Pakistani university students by verified skills, see the evidence behind each one, and contact the ones who choose to be found.",
  headline: "Hire on evidence you can check.",
  intro: "Every skill on Skilient comes with its proof: the code a student wrote, the teammates who confirmed it, the faculty who reviewed the work. Search by what students have done, not what they claim.",
  cta: { label: "Create a recruiter account", href: "/signup/recruiter" as Route },
  signedIn: "Open dashboard",
  see: {
    heading: "What you see",
    items: [
      { title: "Verified skills with their evidence", text: "Each skill shows its level and what proves it: commits and merged pull requests, teammate confirmations, code checks, credentials." },
      { title: "Ventures reviewed by faculty", text: "Projects list the team, each person’s role, and a “Reviewed by faculty” badge when a teacher has scored the work." },
      { title: "A CV that verifies itself", text: "Every CV is signed. Enter its code at skilient.com/verify to see exactly what we checked, and when." },
    ],
    ventureAlt: "A venture’s team (sample content): four members, each with their role, and two open roles.",
  },
  contact: {
    heading: "How contact works",
    steps: [
      { title: "You send a contact request", text: "It names your company and a real role or opportunity. One request uses one credit." },
      { title: "The student decides", text: "They see your company page first, then accept or decline. Requests expire after 14 days." },
      { title: "You talk in a labelled chat", text: "Only after they accept do you see their name. The chat carries your company’s name, and the student can close it any time." },
    ],
    rules: "After a decline you can’t contact the same student again for 90 days. Students choose whether recruiters can find them at all.",
    alt: "A contact request as a student sees it (sample): a verified company, the role, and Accept or Decline.",
  },
  jobs: {
    heading: "Job posts and job fairs",
    text: "Post jobs and internships that students see in Opportunities. Every post shows its pay range; posts without one aren’t accepted. Universities run digital job fairs where your company takes a booth and meets students in a queue.",
    alt: "The Jobs tab (sample posts): a frontend internship and a junior backend role, each with its pay.",
  },
  verification: {
    heading: "Every company is verified",
    text: "Sign up with your work email and turn on two-factor. We check your company before you can see any student, and your email domain must match your website. Students see that you are verified before they answer.",
  },
  plans: {
    heading: "Recruiter plans",
    text: "Start free with names hidden. Paid plans open full profiles, contact requests and team seats.",
    link: "Compare every plan",
  },
};

/** /universities (PRD 5.1, 5.23). */
export const universitiesPage = {
  title: "For universities",
  description: "Run your campus on Skilient: a customisable ecosphere, dashboards, job fairs, hackathons and Student Pro for your students.",
  headline: "Your campus, with proof of what students can do.",
  intro: "Every university on Skilient gets its own ecosphere for free: a university feed, announcements, rankings, faculty and exam calendars. A licence adds dashboards, student records, fairs, hackathons and Student Pro for your students.",
  cta: { label: "Talk to us", href: "#talk" },
  sections: [
    {
      id: "ecosphere",
      heading: "An ecosphere in your colours",
      text: "Your university’s own space inside Skilient: branded pages, modules you switch on and off, announcements pinned for your students, and your exam periods, during which rank doesn’t decay. Free for every university.",
    },
    {
      id: "dashboards",
      heading: "Dashboards built on verified work",
      text: "See which skills your students have proven, by department and batch. Figures cover groups of five or more students only. Basic shows a summary; Growth adds the full dashboard with skills gaps and CSV and PDF exports; Campus adds accreditation reports.",
    },
    {
      id: "records",
      heading: "Individual student records, logged",
      text: "On Growth and Campus your staff can open your own students’ records. Every view is logged, and students on Student Pro see who viewed theirs and when. We say this plainly to students when they sign up.",
    },
    {
      id: "events",
      heading: "Job fairs, hackathons and events",
      text: "Run digital job fairs with company booths and queues, hackathons judged on the work, and campus events with check-in. Fairs and hackathons come with Growth and Campus.",
    },
    {
      id: "pro",
      heading: "Student Pro for your students",
      text: "Growth sponsors Student Pro for final-year students, Campus for everyone. Ability to pay never decides who has a polished CV.",
    },
  ],
  plans: {
    heading: "University licences",
    text: "Licences are yearly, invoiced, and paid by bank transfer or a payment link.",
  },
  talk: {
    heading: "Talk to us",
    text: "Tell us about your university and what you need. We reply by email.",
    name: "Your name",
    role: "Your role",
    roleHelp: "For example, Director of Career Services.",
    organisation: "University",
    email: "Work email",
    message: "What would you like to do with Skilient?",
    submit: "Send",
    sent: "Thank you. We have your message and will reply by email.",
    rateLimited: "Too many messages from this network. Try again in an hour.",
  },
};

/** /faculty (PRD 5.1, 5.21). */
export const facultyPage = {
  title: "For faculty",
  description: "Supervise ventures, confirm your students’ work, post project ideas and grade code checks. Free for faculty.",
  headline: "Your judgement, on the record.",
  intro: "Faculty add the most trusted signal to a student’s proof. What you confirm and review shows on their verified CV, with your name on it. Skilient is free for faculty, and you are never ranked.",
  cta: { label: "Join as faculty", href: "/signup?role=faculty" as Route },
  free: "Free for faculty",
  features: [
    { icon: "ideas", title: "Post project ideas", text: "Write a brief with the skills, team size and deliverables. Students start ventures from it, and the idea closes when its teams are full." },
    { icon: "supervise", title: "Supervise ventures", text: "Follow a team’s contributions and deliverables and comment in a supervisor thread that is separate from the team’s chat." },
    { icon: "confirm", title: "Confirm contributions", text: "Contributions you confirm are marked faculty-confirmed and show on the student’s CV." },
    { icon: "review", title: "Review the work", text: "Score a venture on five criteria with a comment on each. The project then carries a “Reviewed by faculty” badge." },
    { icon: "endorse", title: "Endorse skills", text: "Endorse members of ventures you reviewed or supervised, on the skills they used there." },
    { icon: "grade", title: "Grade code checks", text: "Opt in, choose your skills and a weekly limit, and grade short explanations of real code from your own university." },
  ] as const,
  join: {
    heading: "How you join",
    text: "Sign up with your university email and ask for the faculty role with your department and title. Your university approves it, or we check your university’s public faculty page.",
  },
};

/** /pricing (PRD 4a). Prices and limits come from `plans`. */
export const pricingPage = {
  title: "Pricing",
  description: "Proof is free for every student. Student Pro, recruiter plans and university licences, in PKR.",
  headline: "Proof is free. Polish is optional.",
  intro: "Verification, rank, tiers, your verified CV and being found by recruiters are free for every student, always. Money never buys rank or visibility.",
  audiences: [
    { id: "students", label: "Students" },
    { id: "recruiters", label: "Recruiters" },
    { id: "universities", label: "Universities" },
  ],
  monthly: "Monthly",
  yearly: "Yearly",
  billing: "Billing period",
  free: "Free",
  custom: "Custom",
  perMonth: "a month",
  perYear: "a year",
  trial: "{days}-day free trial",
  students: {
    heading: "Students",
    freeLabel: "Every student",
    freeItems: ["Verified skills, rank, tier and leaderboards", "Your verified CV, refreshed on the 1st of each month", "Share your CV link from Spark tier", "Be found by recruiters, if you choose"],
    sponsored: "Free through your university on a Growth or Campus licence.",
  },
  recruiters: {
    heading: "Recruiters",
    explore: { label: "Explore", items: ["Browse students by tier, skill and university, names hidden", "One job post"] },
    addOns: "Add-ons on every plan",
    sponsoredPost: "Sponsored job post: {price} for {days} days. Labelled “Sponsored” and never ranked above other results in talent search.",
    credits: "Extra contact credits: {price} each.",
    hireFee: "Hiring fee per recorded hire: {intern} for an intern, {fullTime} for a full-time hire. Waived on Growth and Enterprise.",
  },
  universities: {
    heading: "Universities",
    free: { label: "Every university", items: ["Your ecosphere: feed, announcements, rankings, faculty, exam periods", "One admin seat"] },
    note: "Licences are yearly and invoiced.",
  },
  faq: [
    { q: "Does paying change my rank?", a: "No. Rank, tiers, leaderboards and recruiter search never use payment. Student Pro adds conveniences such as PDF export, more CV layouts and seeing who viewed your CV." },
    { q: "How do I pay?", a: "In PKR by card, JazzCash or Easypaisa. University licences are invoiced and paid by bank transfer or a payment link." },
    { q: "Can I cancel?", a: "Yes, any time from Settings. You keep the plan until the end of the period you paid for." },
  ],
};

/** /about (PRD 5.1). Team and incubation from Ahmed (2026-10-03); portraits are two-colour traces in public/marketing/team/. */
export const aboutPage = {
  title: "About",
  description: "Why Skilient exists: a CV should show the work behind it.",
  headline: "A CV should show the work behind it.",
  story: [
    "In Pakistan, thousands of students graduate every year with CVs that look the same. A recruiter can’t tell who has built something and who has only listed it, so good students are passed over and companies hire on guesswork.",
    "Skilient is a place where students build with classmates and prove what they can do with real work. Code, teammates and faculty confirm each skill, and the proof travels with the student as a signed CV anyone can check.",
  ],
  team: {
    heading: "The team",
    people: [
      { slug: "huzaifa-khan", name: "Huzaifa Khan", role: "CEO and Founder" },
      { slug: "ahmed-mursileen", name: "Ahmed Mursileen", role: "CTO and Co-Founder" },
      { slug: "laiba-owais", name: "Laiba Owais", role: "CHRO and Social Media Manager" },
    ],
  },
  incubation: { label: "Incubated at", name: "NEIC", full: "NUTECH Entrepreneurial and Incubation Center" },
  values: {
    heading: "What we hold to",
    items: [
      { term: "Proof is free", detail: "Verification, rank and your verified CV never cost a student anything." },
      { term: "Rank can’t be bought", detail: "No payment touches rank, tiers, leaderboards or search." },
      { term: "Students decide", detail: "Recruiters ask before they contact anyone, and students choose whether they can be found." },
      { term: "No ads, no data sales", detail: "We earn from organisations’ plans, never from selling students’ attention or data." },
    ],
  },
};

/** /terms and /privacy (PRD 5.1). Both are noindex until the final text is written (setup checklist, Phase 12). */
export const legalPages = {
  terms: {
    title: "Terms",
    description: "The Skilient user agreement every account accepts at signup.",
    unavailable: "The agreement couldn't be loaded. Try again in a minute.",
    version: "Version {version}",
  },
  privacy: {
    title: "Privacy",
    description: "What Skilient collects, who can see it, and how to delete it.",
    intro: "This policy is being written. The headings below are what it will cover.",
    headings: [
      "What we collect when you sign up",
      "What we read from GitHub",
      "Who can see your profile, skills and CV",
      "What recruiters see, and when",
      "What your university sees",
      "How long we keep your data",
      "Deleting your account",
      "Your rights and how to contact us",
    ],
  },
};
