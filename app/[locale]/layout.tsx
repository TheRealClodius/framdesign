import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, M_PLUS_1_Code, Mona_Sans } from "next/font/google";
import "@fontsource/google-sans-flex";
import "@fontsource/google-sans-code";
import "../globals.css";
import ConsoleFilter from "@/components/ConsoleFilter";
import Analytics from "@/components/Analytics";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Wordmark + tagline: Mona Sans (variable wght + wdth axes; Expanded at wdth 125)
const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const mPlus1Code = M_PLUS_1_Code({
  variable: "--font-mplus1code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FRAM DESIGN",
  description: "Designing software objects. Digital products lab in Bucharest and Rome. Fitbit (acquired by Google), UiPath.",
  icons: {
    icon: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  openGraph: {
    title: "FRAM DESIGN",
    description: "Designing software objects. Digital products lab in Bucharest and Rome. Fitbit (acquired by Google), UiPath.",
    type: "website",
    locale: "en_US",
    siteName: "FRAM DESIGN",
  },
  twitter: {
    card: "summary_large_image",
    title: "FRAM DESIGN",
    description: "Designing software objects. Digital products lab in Bucharest and Rome. Fitbit (acquired by Google), UiPath.",
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
        className={`${monaSans.variable} ${cormorant.variable} ${jetbrainsMono.variable} ${mPlus1Code.variable} antialiased bg-black text-white selection:bg-white selection:text-black`}
      >
        <ConsoleFilter />
        {children}
        <div id="modal-root" />
        <Analytics />
      </body>
    </html>
  );
}
