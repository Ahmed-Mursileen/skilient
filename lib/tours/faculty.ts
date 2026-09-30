import type { TourDefinition } from "@/lib/tours/types";

/** Written with the faculty portal; no steps until then, so the tour never starts. */
export const facultyTour: TourDefinition = { id: "faculty", startPath: "/", steps: [] };
