import { z } from "zod";
import { DEPARTMENTS, LOOKING_FOR, USERNAME_HINT, USERNAME_RE } from "./options";

/** Mirrors private.reserved_usernames() so the form can say why before the database refuses. */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "auth", "edit", "feed", "help", "me", "new", "null", "onboarding", "ops", "profile",
  "root", "security", "settings", "signin", "signup", "skilient", "staff", "support", "system", "undefined", "uni", "verify",
]);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : null));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, USERNAME_HINT)
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is reserved. Try another.");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your name (2 to 60 characters).")
  .max(60, "Keep your name under 60 characters.");
export const bioSchema = optionalText(280, "Keep your intro under 280 characters.");
export const departmentSchema = z.enum(DEPARTMENTS, { error: "Choose your department." });
export const programmeSchema = optionalText(80, "Keep the programme under 80 characters.");
export const campusSchema = optionalText(60, "Keep the campus under 60 characters.");
export const graduationYearSchema = z.coerce
  .number({ error: "Choose your batch." })
  .int()
  .min(1980, "Choose your batch.")
  .max(2100, "Choose your batch.");
export const visibilitySchema = z.enum(["friends", "university", "global"], { error: "Choose who can see your profile." });
export const lookingForSchema = z
  .array(z.enum(LOOKING_FOR.map((o) => o.value) as ["teammates", "project", "internship", "job", "mentorship"]))
  .max(LOOKING_FOR.length);

/** PRD 5.4: name 2–60, bio ≤ 280, department from the list, visibility enum. */
export const profileSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  bio: bioSchema,
  department: departmentSchema,
  programme: programmeSchema,
  graduationYear: graduationYearSchema,
  campus: campusSchema,
  visibility: visibilitySchema,
  recruiterVisible: z.boolean(),
  lookingFor: lookingForSchema,
});

/** Reads string fields, checkbox lists and switches from a form into plain values for Zod. */
export function formText(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}
export function formList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string");
}
