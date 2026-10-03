import { ogContentType, ogImage, ogSize } from "@/lib/og/image";

export const alt = "A CV should show the work behind it.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("A CV should show the work behind it.", "About Skilient");
}
