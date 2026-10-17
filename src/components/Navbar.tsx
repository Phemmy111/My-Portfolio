"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Moon, Sun, Menu, X, GitFork } from "lucide-react";
import { cn } from "@/lib/utils";
import { PERSONAL } from "@/lib/data";

const NAV_LINKS = [
  { label: "About", href: "/portfolio#about" },
  { label: "Services", href: "/portfolio#services" },
  { label: "Projects", href: "/portfolio#projects" },
  { label: "Obey Business", href: "/" },
  { label: "Music", href: "/portfolio#music" },
  { label: "Contact", href: "/portfolio#contact" },
];

export default function Navbar() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let initialDark = false;
    try {
      const saved = localStorage.getItem("theme") || localStorage.getItem("obey_theme");
      if (saved === "dark" || (!saved && document.documentElement.classList.contains("dark"))) {
        initialDark = true;
      }
    } catch {
      if (document.documentElement.classList.contains("dark")) {
        initialDark = true;
      }
    }

    setDark(initialDark);
    if (initialDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const onThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const isD =
        customEvent.detail === "dark"
          ? true
          : customEvent.detail === "light"
          ? false
          : document.documentElement.classList.contains("dark");
      setDark(isD);
    };

    window.addEventListener("theme-change", onThemeChange);

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("theme-change", onThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      const themeVal = next ? "dark" : "light";
      try {
        localStorage.setItem("theme", themeVal);
        localStorage.setItem("obey_theme", themeVal);
        document.cookie = `theme=${themeVal}; path=/; max-age=31536000; SameSite=Lax`;
        document.cookie = `obey_theme=${themeVal}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}

      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("theme-change", { detail: themeVal }));
      }
      return next;
    });
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[#f8fafc]/90 dark:bg-[#050b14]/90 backdrop-blur-md border-b border-zinc-200 dark:border-slate-800 shadow-xs"
          : "bg-transparent"
      )}
    >
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo with Executive Headshot */}
        <a href="/portfolio" className="font-bold text-xl tracking-tight flex items-center gap-3 group">
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-zinc-400 dark:border-zinc-700 group-hover:border-black dark:group-hover:border-white transition-all duration-200 shadow-xs shrink-0">
            <Image
              src="/femi-headshot.webp"
              alt={PERSONAL.name}
              fill
              sizes="40px"
              className="object-cover"
              priority
            />
          </div>
          <span className="text-black dark:text-white font-black tracking-tight text-lg">
            {PERSONAL.name}
          </span>
        </a>

        {/* Desktop Links */}
        <ul className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-bold text-zinc-900 dark:text-zinc-200 hover:text-black dark:hover:text-white transition-colors duration-200"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <a
            href={PERSONAL.github}
            target="_blank"
            rel="noreferrer"
            className="hidden md:flex p-2 rounded-full text-zinc-900 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-300/60 dark:hover:bg-zinc-800/60 transition-colors"
            aria-label="GitHub"
          >
            <GitFork size={18} />
          </a>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-zinc-900 dark:text-zinc-200 hover:text-black dark:hover:text-white hover:bg-zinc-300/60 dark:hover:bg-zinc-800/60 transition-colors"
            aria-label="Toggle theme"
          >
            {dark ? (
              <Sun size={18} className="text-zinc-100" />
            ) : (
              <Moon size={18} className="text-zinc-950" />
            )}
          </button>

          <a
            href="#contact"
            className="hidden md:inline-flex items-center px-5 py-2 rounded-full bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-sm"
          >
            Hire Me
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden p-2 rounded-full text-zinc-950 dark:text-zinc-100 hover:bg-zinc-300/60 dark:hover:bg-zinc-800/60 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#f8fafc]/95 dark:bg-[#060d1a]/95 backdrop-blur-md border-b border-zinc-200 dark:border-slate-800 px-6 py-5 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm font-bold text-zinc-950 dark:text-zinc-100 hover:text-black dark:hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contact"
            onClick={() => setMenuOpen(false)}
            className="mt-2 inline-flex justify-center items-center px-4 py-2.5 rounded-full bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Hire Me
          </a>
        </div>
      )}
    </header>
  );
}
