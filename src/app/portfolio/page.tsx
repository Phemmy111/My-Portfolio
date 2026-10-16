import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Services from "@/components/Services";
import Projects from "@/components/Projects";
import MusicSection from "@/components/MusicSection";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import PublicObeyWidget from "@/components/PublicObeyWidget";

export const metadata = {
  title: "Femi Adeleke | AI Systems Architect & Full-Stack Developer",
  description: "Portfolio of Femi Adeleke — Lead AI Systems Architect, Creator of Obey, EduMate, OKIKI, and PassMark.",
};

export default function PortfolioPage() {
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
      <PublicObeyWidget />
    </>
  );
}
