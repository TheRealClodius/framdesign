"use client";

import { useEffect, useRef } from "react";

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
          className="w-full h-full object-cover md:object-contain md:scale-[1.2] grayscale opacity-90"
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
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-20">
        <h1 
          className="leading-none tracking-tighter font-sans-flex font-medium text-[#000000] md:text-[6rem] lg:text-[8rem] xl:text-[10rem]"
          style={{
            fontSize: 'clamp(4rem, 20vw, 8rem)',
            transform: 'translateX(16px)',
          }}
        >
          FRAM
        </h1>
      </div>
    </section>
  );
}
