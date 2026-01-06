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
    <section className="flex flex-col items-center justify-center min-h-screen text-center w-full bg-black relative">
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <video
          ref={videoRef}
          src="/hero-video.mp4"
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
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-20">
        <h1 className="text-[4rem] md:text-[6rem] lg:text-[8rem] xl:text-[10rem] leading-none tracking-tighter font-sans-flex text-[#000000]">
          FRAM
        </h1>
      </div>
    </section>
  );
}
