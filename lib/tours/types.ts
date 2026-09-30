/** One coach mark: the element it points at (a `data-tour` id), a title and a sentence or two. */
export interface TourStep {
  anchor: string;
  title: string;
  body: string;
}

export interface TourDefinition {
  id: "student" | "faculty" | "recruiter" | "uni_admin";
  /** Where the tour starts by itself the first time a verified user lands there. */
  startPath: string;
  steps: TourStep[];
}
