import QRCode from "qrcode";

/** The verify link as an SVG QR code in a data: URI (PRD 5.18: in the footer, out of the text). */
export async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#0e0d0bff", light: "#ffffffff" } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
