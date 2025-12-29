import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-white">
      <body
        className={`${cormorant.variable} ${jetbrainsMono.variable} antialiased bg-white text-black selection:bg-black selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
