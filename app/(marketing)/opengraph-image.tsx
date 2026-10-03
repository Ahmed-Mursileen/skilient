import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Prove your skills with real work.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Prove your skills with real work.");
}
