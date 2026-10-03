import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "Check a verified CV.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Check a verified CV.", "Verify a CV");
}
