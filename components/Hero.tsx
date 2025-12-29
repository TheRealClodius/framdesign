import Image from "next/image";

export default function Hero() {
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-20 text-center">
      <div className="relative w-64 h-64 mb-8 md:w-80 md:h-80 grayscale opacity-90">
        {/* Placeholder for the Polar Bear image */}
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 border border-gray-200 rounded-lg">
          <span className="text-sm text-gray-400 font-mono">
            [Polar Bear Image Placeholder]
            <br />
            /polar-bear.png
          </span>
        </div>
        {/* Uncomment below when image is available */}
        {/* <Image
          src="/polar-bear.png"
          alt="Polar bear sitting and looking around"
          fill
          className="object-contain"
          priority
        /> */}
      </div>
      
      <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif tracking-tighter">
        FRAM.
      </h1>
      
      <p className="mt-6 text-sm md:text-base font-mono text-gray-500 max-w-md">
        Building and launching products.
      </p>
    </section>
  );
}

