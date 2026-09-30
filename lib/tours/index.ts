import { facultyTour } from "@/lib/tours/faculty";
import { recruiterTour } from "@/lib/tours/recruiter";
import { studentTour } from "@/lib/tours/student";
import { uniadminTour } from "@/lib/tours/uni-admin";
import type { TourDefinition } from "@/lib/tours/types";

export type { TourDefinition, TourStep } from "@/lib/tours/types";

export const TOURS: Record<TourDefinition["id"], TourDefinition> = {
  student: studentTour,
  faculty: facultyTour,
  recruiter: recruiterTour,
  uni_admin: uniadminTour,
};
