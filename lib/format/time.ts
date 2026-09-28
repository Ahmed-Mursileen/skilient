/** Short times for cards, in Pakistan time (the platform's locale). */
const dayTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
const full = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });

/** "just now", "5m", "3h", then "12 Sep, 14:30", then "12 Sep 2025" after a year. */
export function shortTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 365 * 86400) return dayTime.format(then);
  return dayOnly.format(then);
}

/** "Sat 12 Oct, 18:00" for event times. */
export function eventTime(iso: string): string {
  return `${full.format(new Date(iso))} (PKT)`;
}

/** "12 Sep, 14:30" for a moment in the future (poll closing). */
export function futureTime(iso: string): string {
  return dayTime.format(new Date(iso));
}
