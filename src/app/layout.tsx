import type { Metadata, Viewport } from "next";
import { IM_Fell_English, IM_Fell_English_SC, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";

const blackletter = UnifrakturMaguntia({ weight: "400", subsets: ["latin"], variable: "--font-black", display: "swap" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell", display: "swap" });
const smallCaps = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-sc", display: "swap" });

export const metadata: Metadata = {
  title: "Absolvo — The Digital Sin-Eater",
  description: "Confess a petty modern sin. The Inquisitor roasts it, the Gargoyle eats it, and thou art absolved — with a certificate for thy wallet.",
  applicationName: "Absolvo",
  robots: { index: false }
};
export const viewport: Viewport = { themeColor: "#0f0d0b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${blackletter.variable} ${fell.variable} ${smallCaps.variable}`}>
      <body>{children}</body>
    </html>
  );
}
