import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Proof is free. Polish is optional.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Proof is free. Polish is optional.", "Pricing");
}
