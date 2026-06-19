import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { IntroShader } from "@/components/IntroShader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Modelify",
  description: "AI Content Automation Platform",
  icons: {
    icon: '/brand/LOGO.png',
    shortcut: '/brand/LOGO.png',
    apple: '/brand/LOGO.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full text-gray-900">
        <Providers>
          <IntroShader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
