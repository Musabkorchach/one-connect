import type React from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppWrapper } from "@/components/app-wrapper";
import { ProductionProfile } from "@/components/production-profile";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Made with App Studio",
  description: "One Connect — your Pi username as a universal digital ID for chat, calls, and email",
    generator: 'v0.app'
};

export const viewport = {
  themeColor: "#160a1f",
  userScalable: false,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        {PI_NETWORK_CONFIG.PRODUCTION_REVIEW ? <ProductionProfile /> : <AppWrapper>{children}</AppWrapper>}
      </body>
    </html>
  );
}
