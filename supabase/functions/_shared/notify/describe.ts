/**
 * What a notification says and where it leads, shared by /notifications (Next) and the
 * notify-worker emails (Deno): plain TypeScript, no runtime globals, relative imports.
 */

export interface NotificationInput {
  type: string;
  /** The actor's name, or null for system events and people you can't see. */
  actorName: string | null;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface NotificationText {
  /** One sentence, no trailing period needed in lists (it has one). */
  text: string;
  /** App path to open (no origin). */
  href: string;
  /** Email subject line. */
  subject: string;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function excerpt(data: Record<string, unknown>): string {
  const text = str(data.excerpt) ?? "";
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
}

function postPath(data: Record<string, unknown>): string {
  const id = str(data.post_id);
  return id ? `/post/${id}#comments` : "/feed";
}

function targetWord(value: unknown): string {
  switch (value) {
    case "post":
      return "post";
    case "comment":
      return "comment";
    case "message":
      return "message";
    case "venture":
      return "venture";
    default:
      return "profile";
  }
}

function billingHome(data: Record<string, unknown>): string {
  return data.subject === "org" ? "/org/billing" : data.subject === "university" ? "/uni/billing" : "/settings/billing";
}

function amount(data: Record<string, unknown>): string {
  const n = Number(data.amount ?? 0);
  return `${str(data.currency) ?? "PKR"} ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

export function describeNotification(n: NotificationInput): NotificationText {
  const who = n.actorName ?? "Someone";
  const venture = str(n.data.venture_title) ?? "a venture";
  const ventureId = str(n.data.venture_id);
  const venturePath = ventureId ? `/ventures/${ventureId}` : "/ventures";

  switch (n.type) {
    case "friend_request":
      return { text: `${who} sent you a friend request.`, href: "/friends?tab=received", subject: `${who} wants to be your friend on Skilient` };
    case "friend_accepted":
      return { text: `${who} accepted your friend request.`, href: "/friends", subject: `${who} accepted your friend request` };
    case "application_received":
      return { text: `${who} applied to join ${venture}.`, href: "/requests", subject: `New application to ${venture}` };
    case "application_decided": {
      const status = str(n.data.status);
      if (status === "accepted") {
        return { text: `You're in: your application to ${venture} was accepted.`, href: venturePath, subject: `You've joined ${venture}` };
      }
      if (status === "closed") {
        return { text: `${venture} is no longer taking applications, so yours was closed.`, href: "/requests?tab=sent", subject: `Your application to ${venture} was closed` };
      }
      return { text: `Your application to ${venture} wasn't accepted this time.`, href: "/requests?tab=sent", subject: `An update on your application to ${venture}` };
    }
    case "application_withdrawn":
      return { text: `${who} withdrew their application to ${venture}.`, href: "/requests", subject: `An application to ${venture} was withdrawn` };
    case "invite_received":
      return { text: `${who} invited you to join ${venture}.`, href: "/requests?tab=invites", subject: `${who} invited you to join ${venture}` };
    case "invite_answered": {
      const accepted = str(n.data.status) === "accepted";
      return {
        text: accepted ? `${who} accepted your invite to ${venture}.` : `${who} declined your invite to ${venture}.`,
        href: venturePath,
        subject: accepted ? `${who} joined ${venture}` : `${who} declined your invite`,
      };
    }
    case "ownership_transferred":
      return str(n.data.role) === "old_owner"
        ? { text: `You no longer own ${venture}.`, href: venturePath, subject: `Ownership of ${venture} changed` }
        : { text: `You're now the owner of ${venture}.`, href: venturePath, subject: `You now own ${venture}` };
    case "member_left":
      return { text: `${who} left ${venture}.`, href: `${venturePath}/team`, subject: `${who} left ${venture}` };
    case "member_removed":
      return { text: `You were removed from ${venture}.`, href: venturePath, subject: `You were removed from ${venture}` };
    case "venture_completed":
      return { text: `${venture} is complete. Well done.`, href: venturePath, subject: `${venture} is complete` };
    case "comment_received":
      return { text: `${who} commented on your post: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} commented on your post` };
    case "comment_reply":
      return { text: `${who} replied to your comment: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} replied to your comment` };
    case "comment_mention":
      return { text: `${who} mentioned you in a comment: "${excerpt(n.data)}"`, href: postPath(n.data), subject: `${who} mentioned you on Skilient` };
    case "content_removed": {
      const what = targetWord(n.data.target_type);
      if (n.data.action === "cleared") {
        return {
          text: "A moderator removed your profile's bio and photo for breaking the community guidelines.",
          href: `/moderation/${n.entityId}`,
          subject: "Your profile's bio and photo were removed",
        };
      }
      if (n.data.action === "unlisted") {
        return {
          text: "A moderator unlisted your venture for breaking the community guidelines.",
          href: `/moderation/${n.entityId}`,
          subject: "Your venture was unlisted on Skilient",
        };
      }
      return {
        text: `A moderator removed your ${what} for breaking the community guidelines.`,
        href: `/moderation/${n.entityId}`,
        subject: `Your ${what} was removed from Skilient`,
      };
    }
    case "feedback_update": {
      const labels: Record<string, string> = {
        received: "received",
        reviewing: "being reviewed",
        planned: "planned",
        shipped: "shipped",
        wont_do: "closed without a change",
      };
      const status = labels[str(n.data.status) ?? ""] ?? "updated";
      return {
        text: n.data.replied === true ? `Skilient replied to your feedback. It's now ${status}.` : `Your feedback is now ${status}.`,
        href: "/feedback",
        subject: "An update on your Skilient feedback",
      };
    }
    case "deletion_requested": {
      const when = str(n.data.delete_after);
      const day = when ? new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }) : "in 14 days";
      return {
        text: `Your account will be deleted on ${day}. You can cancel until then.`,
        href: "/settings/account/delete",
        subject: "Your Skilient account is scheduled for deletion",
      };
    }
    case "deletion_cancelled":
      return { text: "Account deletion cancelled. Your account is back as it was.", href: "/settings", subject: "Your Skilient account was not deleted" };
    case "moderation_warning": {
      const what = targetWord(n.data.target_type);
      return {
        text: `A moderator sent you a warning about your ${what}.`,
        href: `/moderation/${n.entityId}`,
        subject: "A warning from Skilient moderators",
      };
    }
    case "account_restricted": {
      const until = str(n.data.until);
      const day = until ? new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }) : null;
      if (n.data.kind === "ban") {
        return {
          text: day ? `Your Skilient account is banned until ${day}.` : "Your Skilient account is banned.",
          href: "/appeals",
          subject: "Your Skilient account is banned",
        };
      }
      if (n.data.kind === "suspend") {
        return {
          text: `Your account is suspended${day ? ` until ${day}` : ""}. You can still read, appeal or delete your account.`,
          href: "/appeals",
          subject: "Your Skilient account is suspended",
        };
      }
      return { text: "Skilient moderators sent you a warning about your account.", href: "/appeals", subject: "A warning from Skilient moderators" };
    }
    case "restriction_lifted":
      return {
        text: n.data.kind === "ban" ? "The ban on your account was lifted." : "The suspension on your account was lifted.",
        href: "/feed",
        subject: "Your Skilient account is active again",
      };
    case "org_sanctioned": {
      const org = str(n.data.org_name) ?? "your organisation";
      const until = str(n.data.until);
      const day = until ? new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Karachi" }) : null;
      const text =
        n.data.kind === "suspend"
          ? `Skilient suspended ${org}. Contact requests and job posts are paused until it is reinstated.`
          : n.data.kind === "throttle"
            ? `Skilient limited ${org} to ${typeof n.data.per_day === "number" ? n.data.per_day : "a few"} contact requests a day${day ? ` until ${day}` : ""}.`
            : `Skilient sent ${org} a warning.`;
      return { text, href: "/appeals", subject: `A decision about ${org} on Skilient` };
    }
    case "appeal_decided":
      return n.data.outcome === "overturned"
        ? { text: "Your appeal was accepted and the decision was reversed.", href: "/appeals", subject: "Your Skilient appeal was accepted" }
        : { text: "Your appeal was reviewed and the decision stands. This is final.", href: "/appeals", subject: "Your Skilient appeal was reviewed" };
    case "chat_message": {
      const thread = str(n.data.thread_id);
      const where = str(n.data.venture_title);
      return {
        text: where ? `${who} in ${where}: "${excerpt(n.data)}"` : `${who} sent you a message: "${excerpt(n.data)}"`,
        href: thread ? `/chat/${thread}` : "/chat",
        subject: where ? `New messages in ${where}` : `${who} sent you a message`,
      };
    }
    case "endorsement_received": {
      const skills = Array.isArray(n.data.skills) ? n.data.skills.filter((s): s is string => typeof s === "string") : [];
      const list = skills.length ? skills.join(", ") : "a skill";
      const username = str(n.data.username);
      return {
        text: `${who} endorsed you for ${list} on ${venture}.`,
        href: username ? `/profile/${username}#endorsements` : venturePath,
        subject: `${who} endorsed you on Skilient`,
      };
    }
    case "endorse_teammates":
      return {
        text: `${venture} is complete. Endorse your teammates for the skills you saw them use.`,
        href: ventureId ? `${venturePath}/team?endorse=1` : "/ventures",
        subject: `Endorse your teammates on ${venture}`,
      };
    case "credential_reviewed": {
      const title = str(n.data.title) ?? "your credential";
      return n.data.approved === true
        ? { text: `${title} was approved and now shows on your profile.`, href: "/me/credentials", subject: "Your credential was approved" }
        : { text: `${title} wasn't approved. See why on your credentials page.`, href: "/me/credentials", subject: "An update on your credential" };
    }
    case "credential_expired": {
      const title = str(n.data.title) ?? "A credential";
      return { text: `${title} has expired, so it no longer counts.`, href: "/me/credentials", subject: "A credential expired" };
    }
    case "code_check_ready": {
      const skill = str(n.data.skill) ?? "your skill";
      return {
        text: `Your ${skill} code check is ready. Start it when you have 10 quiet minutes.`,
        href: `/me/code-checks/${n.entityId}`,
        subject: `Your ${skill} code check is ready`,
      };
    }
    case "code_check_graded": {
      const skill = str(n.data.skill) ?? "your skill";
      return n.data.passed === true
        ? { text: `You passed your ${skill} code check. ${skill} is now L4.`, href: `/me/code-checks/${n.entityId}`, subject: `You passed your ${skill} code check` }
        : { text: `Your ${skill} code check didn't pass this time. See the feedback.`, href: `/me/code-checks/${n.entityId}`, subject: `Your ${skill} code check result` };
    }
    case "teacher_decided":
      return n.data.approved === true
        ? { text: "You're approved as a teacher. Post a project idea or open your portal.", href: "/teach", subject: "You're approved as a teacher on Skilient" }
        : { text: "Your teacher role was removed. Your past reviews and endorsements stay, marked as former faculty.", href: "/teach/apply", subject: "Your teacher role on Skilient" };
    case "supervision_requested":
      return {
        text: `${who} asked you to supervise ${venture}.`,
        href: ventureId ? `/teach/ventures/${ventureId}` : "/teach",
        subject: `${who} asked you to supervise ${venture}`,
      };
    case "supervision_answered": {
      const accepted = n.data.accepted === true;
      const ended = n.data.ended === true;
      return {
        text: ended ? `Supervision of ${venture} ended.` : accepted ? `${who} will supervise ${venture}.` : `${who} can't supervise ${venture}.`,
        href: `${venturePath}/reviews`,
        subject: ended ? `Supervision of ${venture} ended` : accepted ? `${who} will supervise ${venture}` : `An answer about supervising ${venture}`,
      };
    }
    case "supervisor_comment":
      return { text: `${who} wrote in the supervisor thread of ${venture}.`, href: `${venturePath}/reviews`, subject: `A new comment on ${venture}` };
    case "supervisor_confirmed":
      return { text: `${who} confirmed one of your entries on ${venture}. It is faculty-confirmed now.`, href: `${venturePath}/contributions`, subject: `${who} confirmed your work` };
    case "review_requested":
      return { text: `${who} asked you to review ${venture}. You have 14 days.`, href: `/teach/reviews/${n.entityId}`, subject: `Review request for ${venture}` };
    case "review_reminder":
      return { text: `A review of ${venture} is still waiting for you.`, href: `/teach/reviews/${n.entityId}`, subject: `Reminder: review ${venture}` };
    case "review_received":
      return { text: `${who} reviewed ${venture}. Read their feedback.`, href: `${venturePath}/reviews`, subject: `${venture} was reviewed by faculty` };
    case "review_expired":
      return n.data.declined === true
        ? { text: `${who} declined to review ${venture}.`, href: `${venturePath}/reviews`, subject: `A review request for ${venture} was declined` }
        : { text: `A review request for ${venture} expired without an answer. You can ask again.`, href: `${venturePath}/reviews`, subject: `A review request for ${venture} expired` };
    case "venture_abandoned":
      return { text: `${venture} was closed without finishing.`, href: venturePath, subject: `${venture} was closed` };
    case "cv_refreshed":
      return { text: "Your verified CV was refreshed with this month's work. It has a new code.", href: "/me/cv", subject: "Your verified CV was refreshed" };
    case "cv_revoked":
      return {
        text: n.data.count === 1 || n.data.count === undefined ? "Skilient revoked a version of your verified CV." : "Skilient revoked your verified CV.",
        href: "/me/cv",
        subject: "Your verified CV was revoked",
      };
    // Recruiting (PRD 5.20). Notices to students name the company, never the recruiter.
    case "contact_request": {
      const org = str(n.data.org_name) ?? "A company";
      const role = str(n.data.role_title) ?? "a role";
      return { text: `${org} would like to talk to you about ${role}.`, href: `/opportunities/contact-requests/${n.entityId}`, subject: `${org} wants to talk to you on Skilient` };
    }
    case "contact_accepted": {
      const threadId = str(n.data.thread_id);
      return { text: `A student accepted your request about ${str(n.data.role_title) ?? "the role"}. Say hello.`, href: threadId ? `/chat/${threadId}` : "/recruit/contacts", subject: "A student accepted your contact request" };
    }
    case "contact_declined":
      return { text: `A student declined your request about ${str(n.data.role_title) ?? "the role"}. You can ask again after 90 days.`, href: "/recruit/contacts", subject: "An update on your contact request" };
    case "saved_search_matches": {
      const count = typeof n.data.count === "number" ? n.data.count : 1;
      const name = str(n.data.name) ?? "your saved search";
      return { text: `${count} new ${count === 1 ? "student matches" : "students match"} ${name}.`, href: "/recruit/search", subject: `${count} new matches for ${name}` };
    }
    case "org_decided": {
      const org = str(n.data.org_name) ?? "Your organisation";
      const status = str(n.data.status);
      const reason = str(n.data.reason);
      if (status === "verified") return { text: `${org} is verified. Talent search, contact requests and jobs are open.`, href: "/recruit", subject: `${org} is verified on Skilient` };
      return { text: `${org} is ${status === "suspended" ? "suspended" : "not verified"}${reason ? `: ${reason}` : ""}.`, href: "/recruit", subject: `An update on ${org}` };
    }
    case "org_member_joined":
      return { text: "A teammate accepted your invitation and joined your organisation.", href: "/org/members", subject: "A teammate joined your organisation" };
    case "org_spam_review":
      return { text: "Your organisation's contact requests are under review.", href: "/recruit", subject: "A review of your contact requests" };
    case "job_application_received": {
      const job = str(n.data.job_title) ?? "your job";
      return { text: `A student applied to ${job}.`, href: "/recruit/jobs", subject: `New application to ${job}` };
    }
    case "application_stage": {
      const job = str(n.data.job_title) ?? "a job";
      const org = str(n.data.org_name) ?? "The company";
      const stage = str(n.data.stage);
      const reason = str(n.data.reason);
      const href = `/opportunities/applications/${n.entityId}`;
      if (stage === "rejected") return { text: `${org} didn't take your application for ${job} forward.${reason ? ` ${reason}` : ""}`, href, subject: `An update on your application to ${job}` };
      if (stage === "hired") return { text: `${org} hired you for ${job}. Congratulations.`, href, subject: `${org} hired you` };
      return { text: `Your application to ${job} at ${org} moved to ${stage ?? "the next stage"}.`, href, subject: `Your application to ${job} moved to ${stage ?? "the next stage"}` };
    }
    case "job_invite": {
      const job = str(n.data.job_title) ?? "a job";
      const org = str(n.data.org_name) ?? "A company";
      return { text: `${org} invited you to apply for ${job}.`, href: `/opportunities/jobs/${n.entityId}`, subject: `${org} invited you to apply` };
    }
    case "hire_outcome_due":
      return { text: "Is a hire from three months ago meeting expectations? Answer in one tap.", href: "/recruit", subject: "One question about your hire" };
    case "competition_decided": {
      const title = str(n.data.title) ?? "Your competition";
      return n.data.approved === true
        ? { text: `${title} was approved and opens on its start date.`, href: `/recruit/competitions/${n.entityId}`, subject: `${title} was approved` }
        : { text: `${title} needs changes${str(n.data.reason) ? `: ${str(n.data.reason)}` : ""}.`, href: `/recruit/competitions/${n.entityId}`, subject: `${title} needs changes` };
    }
    case "team_invite": {
      const title = str(n.data.title) ?? "a competition";
      return { text: `${who} invited you to team ${str(n.data.team) ?? ""} for ${title}.`.replace(/\s+/g, " "), href: `/competitions/${n.entityId}`, subject: `${who} invited you to a competition team` };
    }
    case "competition_result": {
      const title = str(n.data.title) ?? "the competition";
      return n.data.winner === true
        ? { text: `Your team won ${title}. The winner badge counts toward L4, and your submission earned L3 evidence.`, href: `/competitions/${n.entityId}`, subject: `You won ${title}` }
        : { text: `Results are in for ${title}. Your submission earned L3 evidence.`, href: `/competitions/${n.entityId}`, subject: `Results for ${title}` };
    }
    // Phase 9: university portal.
    case "uni_claim_decided":
      return n.data.approved === true
        ? { text: "Your university claim is approved. You're the owner of its portal.", href: "/uni", subject: "Your university portal is ready" }
        : { text: `Your university claim wasn't approved${str(n.data.reason) ? `: ${str(n.data.reason)}` : ""}.`, href: "/uni/claim", subject: "About your university claim" };
    case "uni_admin_joined":
      return { text: `${who} joined your university portal.`, href: "/uni/settings/admins", subject: "A new admin joined" };
    case "uni_domain_decided":
      return { text: `${str(n.data.domain) ?? "Your domain"} was ${n.data.approved === true ? "added: people can sign up with it now" : "not added"}${str(n.data.reason) ? ` (${str(n.data.reason)})` : ""}.`, href: "/uni/settings/domains", subject: "About your domain request" };
    case "uni_batch_decided":
      return { text: `Your final-year batch request was ${n.data.approved === true ? "applied" : "not applied"}${str(n.data.reason) ? `: ${str(n.data.reason)}` : ""}.`, href: "/uni/sponsorship", subject: "About your final-year batch" };
    case "uni_announcement":
      return { text: `${str(n.data.university) ?? "Your university"}: ${str(n.data.excerpt) ?? "a new announcement"}`, href: `/post/${n.entityId}`, subject: `Announcement from ${str(n.data.university) ?? "your university"}` };
    case "uni_award":
      return { text: `${str(n.data.university) ?? "Your university"} gave you the ${str(n.data.award) ?? "an"} award. It shows on your profile and your next CV.`, href: "/me", subject: `You received ${str(n.data.award) ?? "an award"}` };
    case "uni_question_removed":
      return { text: `Skilient removed your onboarding question "${str(n.data.prompt) ?? ""}": ${str(n.data.reason) ?? ""}`, href: "/uni/settings/ecosphere", subject: "An onboarding question was removed" };
    case "uni_event_reminder":
      return { text: `Tomorrow: ${str(n.data.title) ?? "an event you're going to"}.`, href: `/events/${n.entityId}`, subject: `Reminder: ${str(n.data.title) ?? "your event"}` };
    case "uni_event_cancelled":
      return { text: `${str(n.data.title) ?? "An event you were going to"} was cancelled.`, href: `/events/${n.entityId}`, subject: "An event was cancelled" };
    case "content_hidden_by_university":
      return { text: `${str(n.data.university) ?? "Your university"} hid your ${n.data.kind === "comment" ? "comment" : "post"} in the University Feed: ${str(n.data.reason) ?? ""}. Skilient will review it.`, href: str(n.data.post_id) ? `/post/${str(n.data.post_id)}` : "/feed", subject: "Your university hid your post" };
    case "content_restored":
      return { text: `Skilient reviewed your ${n.data.kind === "comment" ? "comment" : "post"} and restored it.`, href: "/feed", subject: "Your post is back" };
    case "hackathon_judge":
      return { text: `${who} asked you to judge ${str(n.data.title) ?? "a hackathon"}.`, href: "/teach/judging", subject: "You're judging a hackathon" };
    case "fair_invite":
      return { text: "Your company was invited to a university job fair.", href: "/recruit", subject: "Job fair invite" };
    case "fair_called":
      return { text: `${str(n.data.company) ?? "A company"} is calling you at ${str(n.data.fair) ?? "the job fair"}. Answer within 5 minutes.`, href: `/fairs/${n.entityId}`, subject: `${str(n.data.company) ?? "A company"} is calling you` };
    case "billing_payment_succeeded":
      return { text: `Payment received: ${amount(n.data)} for ${str(n.data.title) ?? "your plan"}${n.data.live === false ? " (test, no real money)" : ""}.`, href: billingHome(n.data), subject: "Payment received" };
    case "billing_payment_failed":
      return n.data.renewal
        ? { text: `We couldn't renew ${str(n.data.title) ?? "your plan"}. We'll retry; everything keeps working for 7 days. Check your payment method.`, href: billingHome(n.data), subject: "Your renewal payment failed" }
        : { text: `The payment for ${str(n.data.title) ?? "your checkout"} didn't go through. Nothing was charged.`, href: billingHome(n.data), subject: "Payment didn't go through" };
    case "billing_trial_started":
      return { text: `Your ${n.data.days ?? 7}-day Student Pro trial has started.`, href: "/settings/billing", subject: "Your Student Pro trial has started" };
    case "billing_trial_ended":
      return { text: "Your Student Pro trial has ended. You're on Free; your proof and CV stay.", href: "/settings/billing", subject: "Your trial has ended" };
    case "billing_renewal_reminder":
      return { text: `${str(n.data.plan) ?? "Your plan"} ends on ${str(n.data.ends) ?? "soon"} (${n.data.days} day${n.data.days === 1 ? "" : "s"}). Pay the next period to keep it.`, href: billingHome(n.data), subject: `Your plan ends in ${n.data.days} day${n.data.days === 1 ? "" : "s"}` };
    case "billing_subscription_ended":
      return { text: `${str(n.data.plan) ?? "Your plan"} has ended${n.data.reason === "payment_failed" ? " because the payment failed" : ""}. Your data is kept.`, href: billingHome(n.data), subject: "Your plan has ended" };
    case "billing_invoice_issued":
      return { text: `Invoice for ${str(n.data.title) ?? "your licence"}, due ${str(n.data.due) ?? "in 30 days"}.`, href: billingHome(n.data), subject: "New invoice from Skilient" };
    case "billing_hire_fee":
      return { text: `Hiring fee invoiced: ${amount({ ...n.data, currency: "PKR" })} for a ${n.data.kind === "intern" ? "intern" : "full-time"} hire, due ${str(n.data.due) ?? "in 30 days"}.`, href: "/org/billing", subject: "Hiring fee invoice" };
    case "billing_hire_fee_overdue":
      return { text: "A hiring-fee invoice is overdue. New contact requests are paused until it's paid.", href: "/org/billing", subject: "Hiring fee overdue" };
    case "billing_refund":
      return { text: `Refunded ${amount(n.data)}.`, href: billingHome(n.data), subject: "Refund issued" };
    case "billing_plan_changed":
      return { text: `Your plan changes to ${str(n.data.to) ?? "a new plan"} at renewal.`, href: billingHome(n.data), subject: "Plan change scheduled" };
    case "billing_limits_applied":
      return { text: "Your plan's limits changed: some seats became inactive, posts paused or API tokens were revoked. Nothing was deleted.", href: "/org/billing", subject: "Your plan's limits changed" };
    case "billing_sponsorship_started":
      return { text: `${str(n.data.university) ?? "Your university"} now sponsors your Student Pro.${n.data.paying ? " You can cancel your own plan at the end of its period." : ""}`, href: "/settings/billing", subject: "Your university sponsors Student Pro" };
    case "billing_sponsorship_ending":
      return { text: `${str(n.data.university) ?? "Your university"}'s Student Pro sponsorship ends on ${str(n.data.ends) ?? "soon"}. You can continue Pro yourself.`, href: "/settings/billing", subject: "Sponsored Student Pro is ending" };
    default:
      return { text: "You have a new notification.", href: "/notifications", subject: "New activity on Skilient" };
  }
}
