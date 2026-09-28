/** Mask the local part: "a***a@nutech.edu.pk". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local.at(-1)}`;
  return `${shown}@${domain}`;
}
