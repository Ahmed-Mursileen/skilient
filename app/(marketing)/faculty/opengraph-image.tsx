import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Your judgement, on the record.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Your judgement, on the record.", "For faculty");
}
