import Image from "next/image";

export default function Hero() {
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-20 text-center w-full max-w-[120rem] mx-auto">
      <div className="relative w-[16rem] h-[16rem] mb-8 md:w-[20rem] md:h-[20rem] lg:w-[24rem] lg:h-[24rem] grayscale opacity-90">
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
      
      <h1 className="text-[4rem] md:text-[6rem] lg:text-[8rem] xl:text-[10rem] leading-none font-serif tracking-tighter">
        FRAM.
      </h1>
      
      <p className="mt-6 text-[0.875rem] md:text-[1rem] lg:text-[1.125rem] font-mono text-gray-500 max-w-[28rem]">
        Building and launching products.
      </p>
    </section>
  );
}
