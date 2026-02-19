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
  description: "Grok Share Boardは、xAI『Grok』で生成された画像や動画の保管・共有掲示板です。URLを貼るだけでプロンプトと一緒にストック可能。ログイン不要で誰でも気軽にお使いいただけます。",
  metadataBase: new URL("https://urea.github.io/GrokShareBoard/"),
  openGraph: {
    title: "Grok Share Board",
    description: "Grok Share Boardは、xAI『Grok』で生成された画像や動画の保管・共有掲示板です。URLを貼るだけでプロンプトと一緒にストック可能。ログイン不要で誰でも気軽にお使いいただけます。",
    url: "https://urea.github.io/GrokShareBoard/",
    siteName: "Grok Share Board",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Grok Share Board",
    description: "Grok Share Boardは、xAI『Grok』で生成された画像や動画の保管・共有掲示板です。URLを貼るだけでプロンプトと一緒にストック可能。ログイン不要で誰でも気軽にお使いいただけます。",
    images: ["https://urea.github.io/GrokShareBoard/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
