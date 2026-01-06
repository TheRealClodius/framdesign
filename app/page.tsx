import Hero from "@/components/Hero";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-between bg-black">
      <Hero />
      {/* Black spacer to cover safe area on mobile */}
      <div className="w-full bg-black safe-area-spacer" style={{ minHeight: '60px' }} />
      <div className="w-full bg-white form-container">
        <Contact />
        
        <footer className="w-full text-center py-10 pb-20 text-[10px] font-mono text-gray-500">
          <p>&copy; {new Date().getFullYear()} FRAM DESIGN. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
