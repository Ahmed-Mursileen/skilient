import manifest from "@/content/art.json";

/**
 * Generated art for the organisation pages, About and the Open Graph plate
 * (docs/marketing-design-plan.md B8). Two-colour risograph prints from Higgsfield z_image; each
 * file carries its prompt in EXIF and in content/art.json. Never used for the product itself.
 */
export type ArtName = "recruiters" | "faculty" | "universities" | "about-corridor" | "about-desk" | "og-plate";

export interface ArtFile {
  width: number;
  height: number;
  alt: string;
  model: string;
  job: string;
  prompt: string;
}

export const art = manifest as Record<ArtName, ArtFile>;
