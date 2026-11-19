"use client";

/**
 * HERO SECTION COMPONENT
 * 
 * This component renders the hero section of the website, featuring:
 * - Full-screen video background with autoplay and looping
 * - Large "FRAM" branding text overlay (blend-difference so it reads over the bear and the black)
 * - Positioning line, proof line, and a persistent contact link
 * - Responsive design with mobile and desktop layouts
 * 
 * Location: components/Hero.tsx
 * Used in: app/[locale]/page.tsx (main landing page)
 */
import { Fragment, useEffect, useRef } from "react";
import { CONTACT_MAILTO } from "@/lib/constants";

// Ink metrics for "FRAM" in Mona Sans 900 at 125% width (measured at 1000px):
// ink spans 0.047em to 3.273em, so ink width is 3.226em.
const WORDMARK_INK_EM = 3.226;
const WORDMARK_LEFT_BEARING_EM = 0.047;

// Plain descriptor first, then proof
// A string is plain text; an object renders as a link (the visitor's slot in the proof line)
type MetaItem = string | { text: string; href: string };

// TODO(contact): "Your company" currently opens a mailto. Decide what this link should do
// (e.g. start a "work with FRAM" conversation in the chat, a brief form, or a booking link).
const META_LINES: MetaItem[][] = [
  ["Digital products lab", "Bucharest / Rome"],
  ["Fitbit (acq. Google)", "UiPath", { text: "Your company", href: CONTACT_MAILTO }],
];

const metaKey = (item: MetaItem) => (typeof item === "string" ? item : item.text);

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.error("Video autoplay failed:", error);
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleVideoEnd = () => {
    if (videoRef.current) {
      timeoutRef.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch((error) => {
            console.error("Video replay failed:", error);
          });
        }
      }, 4000); // 16 seconds delay
    }
  };

  return (
    <section className="flex flex-col items-center justify-center min-h-screen md:min-h-screen hero-safe-area text-center w-full bg-black relative">
      <div className="absolute top-0 left-0 right-0 w-full h-full overflow-hidden hero-video-container">
        <video
          ref={videoRef}
          src="/hero-video-2.mp4"
          autoPlay
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover md:object-contain md:scale-[2.1] grayscale opacity-90"
          style={{
            filter: "brightness(1.4) contrast(1.3)",
            backgroundColor: "#000000",
            WebkitBackgroundSize: "cover",
            backgroundSize: "cover",
          }}
          onEnded={handleVideoEnd}
          onError={(e) => {
            console.error("Video loading error:", e);
          }}
        />
      </div>
      
      {/* Edge-to-edge wordmark: sized to the container so the ink touches both sides */}
      <div
        className="relative z-10 flex flex-col justify-center w-full min-h-screen py-20 overflow-hidden mix-blend-difference"
        style={{ containerType: "inline-size" }}
      >
        <h1
          className="leading-none font-wordmark text-white whitespace-nowrap text-left"
          style={{
            fontSize: `calc(100cqw / ${WORDMARK_INK_EM})`,
            marginLeft: `-${WORDMARK_LEFT_BEARING_EM}em`,
          }}
        >
          FRAM
        </h1>
      </div>

      {/* Scrim so the tagline reads over the bear; plain white text, no blend */}
      <div className="absolute bottom-0 left-0 right-0 h-[45%] z-[5] pointer-events-none bg-gradient-to-t from-black via-black/70 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-10 md:pb-14 flex flex-col items-center gap-1.5 text-center pointer-events-none">
        {/* text-balance + nowrap groups: never leave a single word or item alone on a line */}
        <p className="font-tagline text-white text-xl md:text-3xl leading-tight max-w-[40rem] text-balance">
          Designing software&nbsp;objects.
        </p>
        {META_LINES.map((line) => (
          <p
            key={line.map(metaKey).join()}
            className="font-mono uppercase tracking-wider text-[0.65rem] md:text-[0.7rem] text-white/70 leading-relaxed text-balance"
          >
            {line.map((item, i) => (
              <Fragment key={metaKey(item)}>
                {typeof item === "string" ? (
                  <span className="whitespace-nowrap">{item}</span>
                ) : (
                  <a
                    href={item.href}
                    className="pointer-events-auto whitespace-nowrap text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {item.text}
                  </a>
                )}
                {i < line.length - 1 && <>&nbsp;·{" "}</>}
              </Fragment>
            ))}
          </p>
        ))}
      </div>
    </section>
  );
}
