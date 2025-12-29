import Hero from "@/components/Hero";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-between pb-20">
      <Hero />
      <div className="w-full max-w-4xl mx-auto border-t border-gray-100 my-10" />
      <Contact />
      
      <footer className="w-full text-center py-10 text-[10px] font-mono text-gray-400">
        <p>&copy; {new Date().getFullYear()} FRAM DESIGN.SRL-D. All rights reserved.</p>
        <p className="mt-1">Romania</p>
      </footer>
    </main>
  );
}
