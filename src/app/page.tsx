import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Services from "@/components/Services";
import Projects from "@/components/Projects";
import MusicSection from "@/components/MusicSection";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="w-full flex-1">
        <Hero />
        <About />
        <Services />
        <Projects />
        <MusicSection />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
