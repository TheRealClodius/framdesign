"use client";

import { useEffect, useRef } from "react";

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.error("Video autoplay failed:", error);
      });
    }
  }, []);

  return (
    <section className="flex flex-col items-center justify-center min-h-screen md:min-h-screen hero-safe-area text-center w-full bg-black relative">
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <video
          ref={videoRef}
          src="/hero-video.mp4?v=2"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover grayscale opacity-90"
          style={{
            filter: "brightness(1.4) contrast(1.3)",
            backgroundColor: "#000000",
            WebkitBackgroundSize: "cover",
            backgroundSize: "cover",
          }}
          onError={(e) => {
            console.error("Video loading error:", e);
          }}
        />
      </div>
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen md:min-h-screen hero-safe-area px-4 md:px-4 py-20">
        <h1 
          className="leading-none tracking-tighter font-sans-flex text-[#000000] md:text-[6rem] lg:text-[8rem] xl:text-[10rem]"
          style={{
            fontSize: 'clamp(4rem, 20vw, 8rem)',
          }}
        >
          FRAM
        </h1>
      </div>
    </section>
  );
}
