-- Seed data for `supabase db reset`. Never includes users.
-- Phase 1 adds HEC universities and domains; later phases add departments,
-- survey questions, the skills taxonomy, plans and tax rates (PRD 6).
-- Local and CI databases open signup at every university (phase 12 closes all but NUTECH
-- for the closed beta on the hosted project; staff open the rest from /ops).
update public.universities set live_at = now() where live_at is null;
