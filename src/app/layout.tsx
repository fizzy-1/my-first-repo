import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Executive Workspace · Integral Academy", template: "%s · Integral Academy" },
  description: "Integral Academy's internal operating system for directors and senior management.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1e1e2f" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f9" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en-ZA" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
