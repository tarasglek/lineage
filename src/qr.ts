import QRCode from "qrcode-svg";

export function renderQrSvg(text: string): string {
  const qr = new QRCode({
    content: text,
    padding: 2,
    width: 256,
    height: 256,
    color: "#111111",
    background: "#ffffff",
    ecl: "M",
    join: true,
  });
  return qr.svg();
}
