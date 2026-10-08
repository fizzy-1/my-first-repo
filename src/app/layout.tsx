import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display face for the brand wordmark, echoing the Trajan-style capitals in the crest.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-cinzel", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Executive Workspace · Integral Academy", template: "%s · Integral Academy" },
  description: "Integral Academy's internal operating system for directors and senior management.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en-ZA" className={`${inter.variable} ${cinzel.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
