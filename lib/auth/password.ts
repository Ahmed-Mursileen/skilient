import { z } from "zod";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** PRD 5.27: at least 10 characters; the breached-password check runs on the server. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export type PasswordStrength = { score: 0 | 1 | 2 | 3; label: "Too short" | "Weak" | "Fair" | "Strong" };

/**
 * A light strength hint for the meter (length and variety). Not a gate: the server's
 * rules are length and the breached-password list.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN) return { score: 0, label: "Too short" };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const unique = new Set(password).size;
  if (unique < 5) return { score: 1, label: "Weak" };
  const points = (password.length >= 14 ? 2 : password.length >= 12 ? 1 : 0) + (classes >= 3 ? 2 : classes >= 2 ? 1 : 0);
  if (points >= 3) return { score: 3, label: "Strong" };
  if (points >= 1) return { score: 2, label: "Fair" };
  return { score: 1, label: "Weak" };
}
