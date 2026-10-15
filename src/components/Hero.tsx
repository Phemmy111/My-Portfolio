"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { GitFork, MessageCircle, ArrowDown, Sparkles, ChevronRight, ChevronLeft, Phone } from "lucide-react";
import { PERSONAL } from "@/lib/data";

// 11 distinct roles with unique, strange transition animations
const ROLES = [
  {
    title: "Full-Stack Developer",
    subtitle: "Building modern web architectures with Next.js, React & Neon",
    icon: "💻",
    tag: "Clean Code",
    type: "matrix_glitch",
  },
  {
    title: "Automation Engineer",
    subtitle: "Architecting intelligent n8n pipelines & automated business systems",
    icon: "⚙️",
    tag: "n8n Workflows",
    type: "gear_drop",
  },
  {
    title: "Talking Drummer",
    subtitle: "Mastering African percussion, Gángan rhythms & Àpàlà acoustic beats",
    icon: "🥁",
    tag: "Yorùbá Percussion",
    type: "drum_pulse",
  },
  {
    title: "Music Producer",
    subtitle: "Producing Yorùbá gospel songs & vocal arrangements in FL Studio",
    icon: "🎹",
    tag: "Audio Engineering",
    type: "audio_wave",
  },
  {
    title: "Instrumentalist",
    subtitle: "Guitarist & keyboardist playing rich live chords & harmonic riffs",
    icon: "🎸",
    tag: "Guitar & Keys",
    type: "guitar_slice",
  },
  {
    title: "Tech Educator",
    subtitle: "Empowering creators with digital skills via AutoLearn Spot cohorts",
    icon: "🎓",
    tag: "Mentorship",
    type: "flip_card",
  },
  {
    title: "AI Video Creator",
    subtitle: "Directing cinematic AI visual narratives with Google Flow & CapCut",
    icon: "🎬",
    tag: "AI Film Pipeline",
    type: "shutter_zoom",
  },
  {
    title: "Prompt Engineer",
    subtitle: "Fine-tuning LLM instructions, RAG contexts & intelligent agents",
    icon: "🤖",
    tag: "AI Systems",
    type: "terminal_stream",
  },
  {
    title: "Video Editor",
    subtitle: "Crafting viral social edits, marketing commercials & narrative pacing",
    icon: "✂️",
    tag: "Timeline Cuts",
    type: "film_wipe",
  },
  {
    title: "Graphic Designer",
    subtitle: "Designing high-impact brand collateral, presentation decks & visual assets",
    icon: "🎨",
    tag: "Visual Design",
    type: "ink_pop",
  },
  {
    title: "Author & Storyteller",
    subtitle: "Penning African drama shorts & serialized multi-chapter romance novels",
    icon: "📚",
    tag: "Creative Writing",
    type: "book_turn",
  },
];

// Media slider background slides (ready for personal media/video swap)
const BACKGROUND_SLIDES = [
  {
    id: "code",
    name: "Modern Engineering",
    caption: "Full-Stack Web & Scalable Apps",
    pattern: "terminal",
  },
  {
    id: "music",
    name: "Sound & Production",
    caption: "FL Studio, Àpàlà Drums & Gospel Melodies",
    pattern: "audio",
  },
  {
    id: "culture",
    name: "African Heritage",
    caption: "Talking Drum & Yoruba Folklore",
    pattern: "percussion",
  },
  {
    id: "cinema",
    name: "Cinematic Creation",
    caption: "AI Visual Direction & Video Editing",
    pattern: "cinematic",
  },
  {
    id: "education",
    name: "AutoLearn Spot",
    caption: "Building Tomorrow's Tech Builders",
    pattern: "network",
  },
];

// Unique custom transition animation definitions
const roleVariants: Record<string, { initial: any; animate: any; exit: any }> = {
  matrix_glitch: {
    initial: { opacity: 0, x: -40, skewX: -20, filter: "blur(8px)" },
    animate: { opacity: 1, x: 0, skewX: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, x: 40, skewX: 20, filter: "blur(6px)", transition: { duration: 0.3 } },
  },
  gear_drop: {
    initial: { opacity: 0, y: -60, rotate: -25, scale: 0.7 },
    animate: { opacity: 1, y: 0, rotate: 0, scale: 1, transition: { type: "spring", stiffness: 350, damping: 14 } },
    exit: { opacity: 0, y: 50, rotate: 20, scale: 0.8, transition: { duration: 0.28 } },
  },
  drum_pulse: {
    initial: { opacity: 0, scale: 0.2, rotate: -20 },
    animate: {
      opacity: 1,
      scale: [0.2, 1.35, 0.9, 1.15, 1],
      rotate: [-20, 10, -6, 3, 0],
      transition: { duration: 0.7, ease: "easeOut" },
    },
    exit: { opacity: 0, scale: 0.4, rotate: 15, transition: { duration: 0.25 } },
  },
  audio_wave: {
    initial: { opacity: 0, scaleY: 0.05, scaleX: 1.4 },
    animate: { opacity: 1, scaleY: 1, scaleX: 1, transition: { type: "spring", stiffness: 240, damping: 13 } },
    exit: { opacity: 0, scaleY: 1.6, scaleX: 0.6, filter: "blur(8px)", transition: { duration: 0.32 } },
  },
  guitar_slice: {
    initial: { opacity: 0, x: -110, skewY: 14 },
    animate: { opacity: 1, x: 0, skewY: 0, transition: { type: "spring", stiffness: 280, damping: 17 } },
    exit: { opacity: 0, x: 110, skewY: -12, transition: { duration: 0.3 } },
  },
  flip_card: {
    initial: { opacity: 0, rotateX: 90, y: 30 },
    animate: { opacity: 1, rotateX: 0, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
    exit: { opacity: 0, rotateX: -90, y: -30, transition: { duration: 0.35 } },
  },
  shutter_zoom: {
    initial: { opacity: 0, scale: 2.2, filter: "blur(14px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, scale: 0.3, filter: "blur(8px)", transition: { duration: 0.3 } },
  },
  terminal_stream: {
    initial: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
    animate: { opacity: 1, clipPath: "inset(0 0% 0 0)", transition: { duration: 0.55, ease: "easeInOut" } },
    exit: { opacity: 0, y: -20, filter: "blur(6px)", transition: { duration: 0.25 } },
  },
  film_wipe: {
    initial: { opacity: 0, x: 90, filter: "brightness(2)" },
    animate: { opacity: 1, x: 0, filter: "brightness(1)", transition: { duration: 0.45, ease: "backOut" } },
    exit: { opacity: 0, x: -90, filter: "brightness(0.4)", transition: { duration: 0.25 } },
  },
  ink_pop: {
    initial: { opacity: 0, scale: 0.15, rotate: -60 },
    animate: { opacity: 1, scale: 1, rotate: 0, transition: { type: "spring", stiffness: 380, damping: 11 } },
    exit: { opacity: 0, scale: 1.4, filter: "blur(6px)", transition: { duration: 0.28 } },
  },
  book_turn: {
    initial: { opacity: 0, rotateY: -85, x: -45 },
    animate: { opacity: 1, rotateY: 0, x: 0, transition: { duration: 0.6, ease: "easeOut" } },
    exit: { opacity: 0, rotateY: 85, x: 45, transition: { duration: 0.35 } },
  },
};

export default function Hero() {
  const [roleIndex, setRoleIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);

  // Auto-cycle titles with strange unique transitions every 3.2 seconds
  useEffect(() => {
    const roleTimer = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % ROLES.length);
    }, 3200);
    return () => clearInterval(roleTimer);
  }, []);

  // Auto-cycle background media slider every 7 seconds
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % BACKGROUND_SLIDES.length);
    }, 7000);
    return () => clearInterval(slideTimer);
  }, []);

  const currentRole = ROLES[roleIndex];
  const activeVariant = roleVariants[currentRole.type] || roleVariants.matrix_glitch;

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* ============================================================ */}
      {/* BACKGROUND MEDIA SLIDER CANVAS */}
      {/* ============================================================ */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={slideIndex}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {/* Visual media slide track (dynamic patterns representing Femi's creative mediums) */}
            {BACKGROUND_SLIDES[slideIndex].pattern === "terminal" && (
              <div className="absolute inset-0 bg-[radial-gradient(#64748b_1px,transparent_1px)] [background-size:20px_20px] opacity-25 dark:opacity-15" />
            )}
            {BACKGROUND_SLIDES[slideIndex].pattern === "audio" && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 dark:opacity-10">
                <div className="w-[120%] h-64 border-y border-dashed border-zinc-500/40 transform -rotate-6 flex items-center justify-around">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-zinc-600 dark:bg-zinc-400 rounded-full animate-pulse"
                      style={{
                        height: `${20 + (i % 8) * 12}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {BACKGROUND_SLIDES[slideIndex].pattern === "percussion" && (
              <div className="absolute inset-0 flex items-center justify-center opacity-15 dark:opacity-10">
                <div className="w-96 h-96 rounded-full border border-zinc-500/40 animate-ping [animation-duration:4s]" />
                <div className="w-[600px] h-[600px] rounded-full border border-zinc-500/20" />
              </div>
            )}
            {BACKGROUND_SLIDES[slideIndex].pattern === "cinematic" && (
              <div className="absolute inset-0 opacity-20 dark:opacity-10 flex flex-col justify-between py-12">
                <div className="w-full border-b border-dashed border-zinc-500/40 text-[10px] tracking-widest text-center uppercase font-mono py-1">
                  [ 24FPS · 4K CINEMATIC REEL · REC ]
                </div>
                <div className="w-full border-t border-dashed border-zinc-500/40 text-[10px] tracking-widest text-center uppercase font-mono py-1">
                  [ TIME-CODE: 01:24:58:12 ]
                </div>
              </div>
            )}
            {BACKGROUND_SLIDES[slideIndex].pattern === "network" && (
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#64748b10_1px,transparent_1px),linear-gradient(to_bottom,#64748b10_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-35 dark:opacity-15" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Clean atmospheric overlay protecting legibility across light and dark modes */}
        <div className="absolute inset-0 bg-[#dfe3e8]/75 dark:bg-black/85 backdrop-blur-[1px]" />
      </div>

      {/* ============================================================ */}
      {/* MAIN HERO CONTENT */}
      {/* ============================================================ */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-16 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column — Text & Animated Roles */}
          <div className="space-y-6">
            {/* Name */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-none tracking-tight">
              <span className="gradient-text">{PERSONAL.name}</span>
            </h1>

            {/* DYNAMIC ANIMATED ROLES WITH STRANGE UNIQUE TRANSITIONS */}
            <div className="min-h-[108px] sm:min-h-[96px] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentRole.title}
                  initial={activeVariant.initial}
                  animate={activeVariant.animate}
                  exit={activeVariant.exit}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl sm:text-3xl filter contrast-125 select-none">
                      {currentRole.icon}
                    </span>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-zinc-950 dark:text-white">
                      {currentRole.title}
                    </h2>
                    <span className="hidden sm:inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-[#141414] text-black dark:text-zinc-300 border border-zinc-400 dark:border-zinc-800">
                      {currentRole.tag}
                    </span>
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-400 pl-1">
                    {currentRole.subtitle}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Role Timeline Pill Navigation */}
            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-1 max-w-full">
              {ROLES.map((r, i) => (
                <button
                  key={r.title}
                  onClick={() => setRoleIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === roleIndex
                      ? "w-8 bg-black dark:bg-white"
                      : "w-2 bg-zinc-400 dark:bg-zinc-800 hover:bg-zinc-600 dark:hover:bg-zinc-600"
                  }`}
                  aria-label={`Switch to role ${r.title}`}
                />
              ))}
              <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-500 pl-2 select-none">
                {String(roleIndex + 1).padStart(2, "0")}/{ROLES.length}
              </span>
            </div>

            {/* Tagline */}
            <p className="text-base sm:text-lg text-zinc-900 dark:text-zinc-300 max-w-lg leading-relaxed font-medium">
              {PERSONAL.tagline}
            </p>

            {/* Brand */}
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-400">
              Founder of{" "}
              <span className="text-black dark:text-white underline decoration-zinc-500 dark:decoration-zinc-600 underline-offset-2">
                {PERSONAL.brand}
              </span>
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3.5 pt-2">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all duration-200 hover:scale-105 shadow-md dark:shadow-white/10"
              >
                <MessageCircle size={18} />
                Hire Me
              </a>
              <a
                href="/call"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all duration-200 hover:scale-105 shadow-md shadow-emerald-600/30 group"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-200" />
                </span>
                <Phone size={16} />
                <span>Call Obey (Voice AI)</span>
              </a>
              <a
                href="#projects"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border-2 border-zinc-950 dark:border-white/20 bg-white/90 dark:bg-white/[0.04] text-zinc-950 dark:text-white font-bold hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-all duration-200 hover:scale-105 shadow-xs"
              >
                View My Work
              </a>
              <a
                href={PERSONAL.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-zinc-400 dark:border-zinc-800 bg-white/70 dark:bg-[#080808] text-zinc-950 dark:text-zinc-200 font-bold hover:border-black dark:hover:border-zinc-600 hover:text-black dark:hover:text-white transition-all duration-200 shadow-xs"
              >
                <GitFork size={18} />
                GitHub
              </a>
            </div>
          </div>

          {/* Right Column — AutoLearn Spot Real Logo (Faded & Atmospheric) */}
          <div className="relative hidden lg:flex justify-center items-center">
            <div className="relative w-80 h-80 flex items-center justify-center">
              {/* Rotating outer orbital ring */}
              <div className="absolute inset-0 rounded-full border border-dashed border-zinc-400/80 dark:border-zinc-800 animate-spin [animation-duration:35s]" />
              <div className="absolute inset-3 rounded-full border border-zinc-400/30 dark:border-zinc-800/40" />

              {/* Faded Real AutoLearn Spot Logo Canvas */}
              <div className="relative w-64 h-64 rounded-full bg-white/60 dark:bg-[#080808]/70 backdrop-blur-xs border border-zinc-300 dark:border-zinc-800/90 shadow-2xl flex items-center justify-center p-8 group transition-all duration-300 hover:border-zinc-500 dark:hover:border-zinc-700">
                <div className="relative w-44 h-44">
                  <Image
                    src="/autolearn-spot-logo.png"
                    alt="AutoLearn Spot Logo"
                    fill
                    sizes="200px"
                    className="object-contain opacity-40 dark:opacity-30 group-hover:opacity-75 transition-opacity duration-500 select-none pointer-events-none drop-shadow-sm"
                    priority
                  />
                </div>
              </div>

              {/* Floating discipline badges around the orbital ring */}
              <div className="absolute -top-3 -right-3 bg-zinc-950 text-white dark:bg-[#0e0e0e] dark:text-zinc-100 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-lg border border-zinc-700 dark:border-zinc-800">
                💻 Dev
              </div>
              <div className="absolute -bottom-3 -left-3 bg-zinc-900 text-white dark:bg-[#0e0e0e] dark:text-zinc-100 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-lg border border-zinc-700 dark:border-zinc-800">
                🥁 Drummer
              </div>
              <div className="absolute top-1/2 -right-8 bg-white text-zinc-950 dark:bg-[#0e0e0e] dark:text-zinc-100 border border-zinc-300 dark:border-zinc-800 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-md">
                ⚙️ Automation
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Background Slider Controller & Scroll Indicator */}
        <div className="mt-16 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-400/30 dark:border-zinc-900">
          {/* Slider Tracker */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400 font-bold flex items-center gap-1.5">
              <Sparkles size={13} className="text-black dark:text-white" />
              Reel: {BACKGROUND_SLIDES[slideIndex].name}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setSlideIndex(
                    (prev) => (prev - 1 + BACKGROUND_SLIDES.length) % BACKGROUND_SLIDES.length
                  )
                }
                className="p-1 rounded-full text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-300/60 dark:hover:bg-zinc-800"
                aria-label="Previous background slide"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setSlideIndex((prev) => (prev + 1) % BACKGROUND_SLIDES.length)}
                className="p-1 rounded-full text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-300/60 dark:hover:bg-zinc-800"
                aria-label="Next background slide"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Scroll down indicator */}
          <a
            href="#about"
            className="flex items-center gap-2 text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors group"
          >
            <span className="text-xs font-bold tracking-widest uppercase">Explore Work</span>
            <ArrowDown size={14} className="animate-bounce" />
          </a>
        </div>
      </div>
    </section>
  );
}
