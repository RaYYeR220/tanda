import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tanda — La tanda de siempre. Sin el riesgo.",
  description: "AI-organized savings circles on-chain. Save together, in pesos, without the trust problem.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
