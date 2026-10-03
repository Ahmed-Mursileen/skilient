import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Hire on evidence you can check.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Hire on evidence you can check.", "For recruiters");
}
