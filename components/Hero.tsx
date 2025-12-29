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
    <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-20 text-center w-full max-w-[120rem] mx-auto bg-white">
      <div className="relative w-[16rem] h-[16rem] mb-8 md:w-[20rem] md:h-[20rem] lg:w-[24rem] lg:h-[24rem] bg-white rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src="/hero-video.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-contain grayscale opacity-90"
          style={{
            filter: "brightness(1.4) contrast(1.3)",
          }}
          onError={(e) => {
            console.error("Video loading error:", e);
          }}
        />
      </div>
      
      <h1 className="text-[4rem] md:text-[6rem] lg:text-[8rem] xl:text-[10rem] leading-none font-serif tracking-tighter">
        FRAM.
      </h1>
      
      <p className="mt-6 text-[0.875rem] md:text-[1rem] lg:text-[1.125rem] font-mono text-gray-500 max-w-[28rem]">
        Building and launching products.
      </p>
    </section>
  );
}
