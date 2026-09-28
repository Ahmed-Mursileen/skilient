import { describe, expect, it } from "vitest";
import { describeNotification } from "@/supabase/functions/_shared/notify/describe";
import { digestEmail, instantEmail } from "@/supabase/functions/_shared/notify/email";

const base = { actorName: "Amna Khan", entityType: "venture", entityId: "e1", data: { venture_id: "v1", venture_title: "Bus tracker" } };

describe("describeNotification", () => {
  it("words every phase 3 slice 2 type and links somewhere real", () => {
    const types = [
      "friend_request", "friend_accepted", "application_received", "application_decided", "application_withdrawn",
      "invite_received", "invite_answered", "ownership_transferred", "member_left", "member_removed",
      "venture_completed", "venture_abandoned",
    ];
    for (const type of types) {
      const d = describeNotification({ ...base, type });
      expect(d.text, type).not.toBe("You have a new notification.");
      expect(d.href.startsWith("/"), type).toBe(true);
      expect(d.subject.length, type).toBeGreaterThan(5);
      expect(d.text, type).not.toMatch(/—/); // no em-dashes in UI copy (screen spec)
    }
  });

  it("uses the decision in application_decided", () => {
    expect(describeNotification({ ...base, type: "application_decided", data: { ...base.data, status: "accepted" } }).text)
      .toBe("You're in: your application to Bus tracker was accepted.");
    expect(describeNotification({ ...base, type: "application_decided", data: { ...base.data, status: "declined" } }).href)
      .toBe("/requests?tab=sent");
  });

  it("falls back to 'Someone' and 'a venture' when details are missing", () => {
    const d = describeNotification({ type: "application_received", actorName: null, entityType: "application", entityId: "x", data: {} });
    expect(d.text).toBe("Someone applied to join a venture.");
    expect(describeNotification({ ...base, type: "mystery" }).href).toBe("/notifications");
  });
});

describe("notification emails", () => {
  it("escapes names in the HTML and links to settings", () => {
    const d = describeNotification({ ...base, type: "friend_request", actorName: "<script>x</script>" });
    const mail = instantEmail("s@nutech.edu.pk", "https://app.test", d);
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("https://app.test/settings/notifications");
    expect(mail.text).toContain("https://app.test/friends?tab=received");
  });

  it("digest counts the rest beyond the listed items", () => {
    const mail = digestEmail("s@nutech.edu.pk", "https://app.test", [{ text: "One.", href: "/a" }, { text: "Two.", href: "/b" }], 3);
    expect(mail.subject).toBe("5 things waiting for you on Skilient");
    expect(mail.text).toContain("And 3 more.");
  });
});
