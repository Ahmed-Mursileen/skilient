import type { CvSnapshotV1 } from "./types";

/** A made-up full CV (every section filled, fifteen skills, a private repository) for the ATS test and the staff PDF check. */
export const FULL_SNAPSHOT: CvSnapshotV1 = {
  schema: "skilient.cv/1",
  person: {
    name: "Ayesha Khan",
    username: "ayesha_k",
    university: "National University of Technology",
    department: "Computer Science",
    graduation_year: 2027,
    email: null,
  },
  standing: { tier: "flare", top_percent: 18 },
  sections: ["summary", "skills", "projects", "open_source", "endorsements", "credentials", "education"],
  summary:
    "Computer Science student at National University of Technology, class of 2027, with verified work in React, TypeScript and PostgreSQL across 4 ventures (2 completed). 3 merged pull requests to other developers' repositories. Flare tier on Skilient, top 18%.",
  skills: [
    "React", "TypeScript", "PostgreSQL", "Python", "Django", "Docker", "Tailwind CSS", "Node.js", "GraphQL", "Redis",
    "Figma", "Flutter", "Kotlin", "Go", "Rust",
  ].map((name, i) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    level: i < 2 ? 4 : i < 6 ? 3 : 2,
    evidence: { repos: 8 - (i % 8), active_days: 40 - i, pull_requests: i % 3, entries: i % 4, endorsements: i % 5 },
  })),
  projects: [
    ["Campus Timetable Planner", "completed", "2026-06", "2026-09", "lead", true, "org/timetable"],
    ["Canteen Pre-order System", "completed", "2026-03", "2026-05", "developer", false, "Private repository"],
    ["Library Seat Finder", "in_progress", "2026-08", null, "designer", false, null],
    ["Hostel Maintenance Tracker", "in_progress", "2026-07", null, "former_member", false, "org/hostel"],
  ].map(([title, status, started, completed, role, owner, repository], i) => ({
    id: `00000000-0000-0000-0000-00000000000${i}`,
    title: title as string,
    type: i === 1 ? "startup" : "project",
    status: status as "completed" | "in_progress",
    role: role as string,
    owner: owner as boolean,
    started: started as string,
    completed: completed as string | null,
    team_size: 3 + i,
    verified_entries: 6 - i,
    faculty_confirmed: 0,
    faculty_reviewed: false,
    deliverables: 3 - (i % 3),
    skills: ["React", "TypeScript"],
    repository: repository as string | null,
    description: `A tool the team built for students (${i + 1}). It finds free slots, suggests routes and saves effort every week.`,
  })),
  open_source: [
    { repository: "vercel/next.js", number: 71234, merged: "2026-09-12", skills: ["TypeScript"] },
    { repository: "supabase/supabase", number: 30111, merged: "2026-08-02", skills: ["TypeScript", "PostgreSQL"] },
    { repository: "Private repository", number: null, merged: "2026-07-21", skills: [] },
  ],
  endorsements: [
    { endorser: "Bilal Ahmed", skill: "React", venture: "Campus Timetable Planner", note: "Built the whole parser in a week.", date: "2026-09-20" },
    { endorser: "Sara Malik", skill: "TypeScript", venture: "Campus Timetable Planner", note: null, date: "2026-09-18" },
    { endorser: "Hamza Qureshi", skill: "PostgreSQL", venture: "Canteen Pre-order System", note: "Designed the schema.", date: "2026-05-30" },
  ],
  credentials: [
    { title: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services (AWS)", issued: "2026-01", expires: "2029-01" },
    { title: "Google Data Analytics", issuer: "Google", issued: "2025-11", expires: null },
  ],
  education: { university: "National University of Technology", department: "Computer Science", graduation_year: 2027 },
};
