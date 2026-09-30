/** Identity as the client sees it (PRD 5.2: useCurrentUser() is the only way pages read identity). */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  universityId: string | null;
  universityName: string | null;
  onboardingComplete: boolean;
  role: "student" | "faculty" | "recruiter" | "university_admin";
  status: "active" | "graduate" | "deleting";
}
