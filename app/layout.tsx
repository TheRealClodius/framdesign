import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import "@fontsource/google-sans-flex";
import "@fontsource/google-sans-code";
import "./globals.css";
import ConsoleFilter from "@/components/ConsoleFilter";
import Analytics from "@/components/Analytics";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FRAM DESIGN",
  description: "Building and launching products. iOS apps, AI agents, and innovative solutions.",
  icons: {
    icon: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  openGraph: {
    title: "FRAM DESIGN",
    description: "Building and launching products. iOS apps, AI agents, and innovative solutions.",
    type: "website",
    locale: "en_US",
    siteName: "FRAM DESIGN",
  },
  twitter: {
    card: "summary_large_image",
    title: "FRAM DESIGN",
    description: "Building and launching products. iOS apps, AI agents, and innovative solutions.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-black">
      <body
        className={`${cormorant.variable} ${jetbrainsMono.variable} antialiased bg-black text-white selection:bg-white selection:text-black`}
      >
        <ConsoleFilter />
        {children}
        <div id="modal-root" />
        <Analytics />
      </body>
    </html>
  );
}
