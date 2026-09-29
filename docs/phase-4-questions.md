# Phase 4: questions and decisions for Ahmed

Running list kept while the phase 4 slices are built and merged. Each item says what was
assumed so the work could continue; answer inline (or in chat) and the assumption is either
kept or changed in a follow-up PR. Answered items move to `docs/decisions.md`.

## Open

- **/me/credentials link** (slice 3): reached from Settings (a "Credentials" row) and the owner's
  profile until the phase 6 "Me" area. Assumed fine as a stopgap.
- **Reviewer name** (slice 3): the student never sees who reviewed a credential (like
  moderation). Assumed.

- **Severity on Clear and Unlist** (slice 5): every decision that upholds a report takes a
  severity and costs the owner points, including "Clear bio and photo" and "Unlist" (they are
  Remove for profiles and ventures), not only Remove and Warn. Say if those two should cost
  nothing.
- **Tiers are cumulative** (slice 5): each tier needs its own milestone and every lower one's,
  so a top-10% student with no L3 skill stays Flare. Assumed from "points plus a real-world
  milestone for each tier".

## Waiting on Ahmed's review

- **Recognised issuers** (slice 3, sent 2026-09-30): HEC, NAVTTC, PSEB, PIAIC, NFTP, DigiSkills.pk,
  Google, Microsoft, AWS, Cisco, Oracle, Meta, IBM, CompTIA, The Linux Foundation, Red Hat, Huawei,
  each with a few aliases for the reviewer's suggestion. Add or remove any?
- **Code-check change requests** (slice 4, sent 2026-09-30): 8 fixed prompts for each of the six
  skill categories (48), plus the two fixed questions. Change or add any?

## Answered

- **Plan questions 1–32** (2026-09-30): all defaults accepted, except: L4 endorsers may come from
  any of the student's ventures (Q3); credential PDFs ≤ 5 MB (Q14); PIAIC and NFTP added to the
  issuer seed (Q15); venture completions exempt from the rapid-gain hold, with more than 2
  completions in 7 days still flagged (Q27). Supabase stays on the Free plan; storage use is
  reported so the 1 GB limit is seen coming. See decisions.md.
