import type { TourDefinition } from "@/lib/tours/types";

/** Written with the recruiter portal; no steps until then, so the tour never starts. */
export const recruiterTour: TourDefinition = { id: "recruiter", startPath: "/", steps: [] };
