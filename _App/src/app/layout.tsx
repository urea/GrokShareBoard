import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grok Share Board",
  description: "Share and discover Grok Imagine creations. A curated platform for xAI's Grok generated images and videos.",
  metadataBase: new URL("https://urea.github.io/GrokShareBoard/"),
  openGraph: {
    title: "Grok Share Board",
    description: "Share and discover Grok Imagine creations. No login required.",
    url: "https://urea.github.io/GrokShareBoard/",
    siteName: "Grok Share Board",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Grok Share Board",
    description: "Share and discover Grok Imagine creations.",
    // images: ["/og-image.png"], // TODO: Add an OG image later
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
