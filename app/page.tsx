import Hero from "@/components/Hero";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-between bg-black">
      <Hero />
      <div className="w-full bg-white">
        <Contact />
        
        <footer className="w-full text-center py-10 pb-20 text-[10px] font-mono text-gray-500">
          <p>&copy; {new Date().getFullYear()} FRAM DESIGN. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
