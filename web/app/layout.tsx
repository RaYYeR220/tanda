import type { Metadata } from "next";
import { Yeseva_One, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import GrainOverlay from "@/components/GrainOverlay";
import PapelPicado from "@/components/PapelPicado";

const yesevaOne = Yeseva_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tanda — La tanda de siempre. Sin el riesgo.",
  description:
    "AI-organized savings circles on-chain. Save together, in pesos, without the trust problem. Your money is protected by smart contracts and an AI underwriter — not by handshakes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${yesevaOne.variable} ${hankenGrotesk.variable}`}
    >
      <body className="font-body bg-cream text-ink">
        <GrainOverlay />
        <PapelPicado variant="hero" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
