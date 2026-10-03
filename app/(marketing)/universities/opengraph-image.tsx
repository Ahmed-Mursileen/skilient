import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Your campus, with proof of what students can do.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Your campus, with proof of what students can do.", "For universities");
}
