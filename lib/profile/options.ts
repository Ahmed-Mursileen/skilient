/**
 * Choices shared by onboarding and Settings → Profile. Departments are a platform-wide
 * list until universities configure their own (5.23, phase 9).
 */
export const DEPARTMENTS = [
  "Accounting and Finance",
  "Architecture",
  "Artificial Intelligence",
  "Biotechnology",
  "Business Administration",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Computer Engineering",
  "Computer Science",
  "Cyber Security",
  "Data Science",
  "Economics",
  "Education",
  "Electrical Engineering",
  "Electronics Engineering",
  "English",
  "Environmental Sciences",
  "Fine Arts and Design",
  "Information Technology",
  "International Relations",
  "Law",
  "Management Sciences",
  "Mass Communication and Media",
  "Mathematics",
  "Mechanical Engineering",
  "Mechatronics Engineering",
  "Medicine and Health Sciences",
  "Pharmacy",
  "Physics",
  "Psychology",
  "Software Engineering",
  "Statistics",
  "Telecommunication Engineering",
  "Textile Engineering",
  "Other",
] as const;

/** Batch = expected (or actual) graduation year. */
export function graduationYears(now = new Date()): number[] {
  const year = now.getFullYear();
  const years: number[] = [];
  for (let y = year + 6; y >= year - 15; y--) years.push(y);
  return years;
}

/** What a student is open to (5.27 multi-select). Stored as an enum array for matching later. */
export const LOOKING_FOR = [
  { value: "teammates", label: "Teammates" },
  { value: "project", label: "A project to join" },
  { value: "internship", label: "An internship" },
  { value: "job", label: "A job" },
  { value: "mentorship", label: "Faculty mentorship" },
] as const;
export type LookingFor = (typeof LOOKING_FOR)[number]["value"];

export const VISIBILITY = [
  { value: "university", label: "My university", description: "Signed-in students and staff at your university see your full profile." },
  { value: "global", label: "Everyone on Skilient", description: "Every signed-in Skilient user sees your full profile. Never public on the web." },
  { value: "friends", label: "Friends only", description: "Only your friends see your full profile." },
] as const;
export type Visibility = (typeof VISIBILITY)[number]["value"];

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const USERNAME_HINT = "3 to 30 characters: lowercase letters, numbers or _.";
