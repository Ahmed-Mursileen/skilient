import { describe, expect, it } from "vitest";
import { describeNotification } from "@/supabase/functions/_shared/notify/describe";
import { digestEmail, instantEmail } from "@/supabase/functions/_shared/notify/email";

const base = { actorName: "Amna Khan", entityType: "venture", entityId: "e1", data: { venture_id: "v1", venture_title: "Bus tracker" } };

describe("describeNotification", () => {
  it("words every phase 3 slice 2 type and links somewhere real", () => {
    const types = [
      "friend_request", "friend_accepted", "application_received", "application_decided", "application_withdrawn",
      "invite_received", "invite_answered", "ownership_transferred", "member_left", "member_removed",
      "venture_completed", "venture_abandoned", "comment_received", "comment_reply", "comment_mention", "chat_message",
      "content_removed", "moderation_warning", "cv_refreshed", "cv_revoked",
      "feedback_update", "deletion_requested", "deletion_cancelled",
      "teacher_decided", "supervision_requested", "supervision_answered", "supervisor_comment",
      "supervisor_confirmed", "review_requested", "review_reminder", "review_received", "review_expired",
      "contact_request", "contact_accepted", "contact_declined", "saved_search_matches", "org_decided", "org_member_joined",
      "org_spam_review", "job_application_received", "application_stage", "job_invite", "hire_outcome_due",
      "competition_decided", "team_invite", "competition_result",
    ];
    for (const type of types) {
      const d = describeNotification({ ...base, type });
      expect(d.text, type).not.toBe("You have a new notification.");
      expect(d.href.startsWith("/"), type).toBe(true);
      expect(d.subject.length, type).toBeGreaterThan(5);
      expect(d.text, type).not.toMatch(/—/); // no em-dashes in UI copy (screen spec)
    }
  });

  it("tells a student which company wrote, never which recruiter", () => {
    const d = describeNotification({ ...base, type: "contact_request", actorName: null, entityId: "r1", data: { org_name: "Acme", role_title: "React intern" } });
    expect(d.text).toBe("Acme would like to talk to you about React intern.");
    expect(d.href).toBe("/opportunities/contact-requests/r1");
  });

  it("gives a rejected applicant a generic reason", () => {
    const d = describeNotification({ ...base, type: "application_stage", actorName: null, entityId: "a1", data: { job_title: "Intern", org_name: "Acme", stage: "rejected", reason: "The position has been filled." } });
    expect(d.text).toContain("The position has been filled.");
    expect(d.href).toBe("/opportunities/applications/a1");
  });

  it("names what was moderated, never who", () => {
    const d = describeNotification({ ...base, type: "content_removed", actorName: null, entityId: "c1", data: { target_type: "comment" } });
    expect(d.text).toBe("A moderator removed your comment for breaking the community guidelines.");
    expect(d.href).toBe("/moderation/c1");
    expect(describeNotification({ ...base, type: "content_removed", actorName: null, entityId: "c2", data: { target_type: "venture", action: "unlisted" } }).text).toBe(
      "A moderator unlisted your venture for breaking the community guidelines.",
    );
    expect(describeNotification({ ...base, type: "content_removed", actorName: null, entityId: "c3", data: { target_type: "profile", action: "cleared" } }).subject).toBe(
      "Your profile's bio and photo were removed",
    );
  });

  it("uses the decision in application_decided", () => {
    expect(describeNotification({ ...base, type: "application_decided", data: { ...base.data, status: "accepted" } }).text)
      .toBe("You're in: your application to Bus tracker was accepted.");
    expect(describeNotification({ ...base, type: "application_decided", data: { ...base.data, status: "declined" } }).href)
      .toBe("/requests?tab=sent");
  });

  it("names the endorsed skills and opens the endorsee's profile or the endorse sheet", () => {
    const d = describeNotification({
      ...base,
      type: "endorsement_received",
      data: { ...base.data, skills: ["React", "Python"], username: "amna_k" },
    });
    expect(d.text).toContain("endorsed you for React, Python");
    expect(d.href).toBe("/profile/amna_k#endorsements");
    const prompt = describeNotification({ ...base, type: "endorse_teammates", actorName: null });
    expect(prompt.href).toMatch(/\/ventures\/[^/]+\/team\?endorse=1$/);
  });

  it("tells the student a credential decision and links to their credentials", () => {
    const yes = describeNotification({ ...base, type: "credential_reviewed", actorName: null, data: { title: "AWS Cloud Practitioner", approved: true } });
    expect(yes.text).toBe("AWS Cloud Practitioner was approved and now shows on your profile.");
    const no = describeNotification({ ...base, type: "credential_reviewed", actorName: null, data: { title: "Oracle Java", approved: false } });
    expect(no.href).toBe("/me/credentials");
    expect(no.text).not.toContain("Amna"); // never who reviewed it
    expect(describeNotification({ ...base, type: "credential_expired", actorName: null, data: { title: "CCNA" } }).text).toContain("expired");
  });

  it("links code-check notifications to the check", () => {
    const ready = describeNotification({ ...base, type: "code_check_ready", actorName: null, entityId: "cc1", data: { skill: "Python" } });
    expect(ready).toMatchObject({ href: "/me/code-checks/cc1", subject: "Your Python code check is ready" });
    const pass = describeNotification({ ...base, type: "code_check_graded", actorName: null, entityId: "cc1", data: { skill: "Python", passed: true } });
    expect(pass.text).toBe("You passed your Python code check. Python is now L4.");
  });

  it("tells an account about sanctions and appeals without naming staff, and links to /appeals", () => {
    const suspended = describeNotification({ ...base, type: "account_restricted", entityType: "sanction", data: { kind: "suspend", until: "2026-10-09T10:00:00Z" } });
    expect(suspended.text).toBe("Your account is suspended until 9 October 2026. You can still read, appeal or delete your account.");
    expect(suspended.href).toBe("/appeals");
    expect(describeNotification({ ...base, type: "account_restricted", data: { kind: "ban", until: null } }).text).toBe("Your Skilient account is banned.");
    expect(describeNotification({ ...base, type: "restriction_lifted", data: { kind: "suspend" } }).text).toBe("The suspension on your account was lifted.");
    expect(describeNotification({ ...base, type: "org_sanctioned", data: { kind: "throttle", per_day: 3, org_name: "Acme", until: "2026-10-09T10:00:00Z" } }).text).toBe(
      "Skilient limited Acme to 3 contact requests a day until 9 October.",
    );
    expect(describeNotification({ ...base, type: "appeal_decided", data: { outcome: "overturned" } }).text).toBe("Your appeal was accepted and the decision was reversed.");
    expect(describeNotification({ ...base, type: "appeal_decided", data: { outcome: "upheld" } }).text).toContain("This is final.");
    for (const t of ["account_restricted", "restriction_lifted", "org_sanctioned", "appeal_decided"]) {
      expect(describeNotification({ ...base, type: t, data: {} }).text).not.toContain("Amna Khan");
    }
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
