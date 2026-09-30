import type { TourDefinition } from "@/lib/tours/types";

/** Written with the uni admin portal; no steps until then, so the tour never starts. */
export const uniadminTour: TourDefinition = { id: "uni_admin", startPath: "/", steps: [] };
