"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  const applyTheme = (next: "light" | "dark") => {
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
      localStorage.setItem("obey_theme", next);
      document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `obey_theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("theme-change", { detail: next }));
    }
  };

  useEffect(() => {
    setMounted(true);
    let initial: "light" | "dark" = "light";
    try {
      const saved = localStorage.getItem("theme") || localStorage.getItem("obey_theme");
      if (saved === "dark" || (!saved && document.documentElement.classList.contains("dark"))) {
        initial = "dark";
      } else {
        initial = "light";
      }
    } catch {
      if (document.documentElement.classList.contains("dark")) {
        initial = "dark";
      }
    }

    setTheme(initial);
    if (initial === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const onThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const newTheme =
        customEvent.detail === "dark" || customEvent.detail === "light"
          ? (customEvent.detail as "light" | "dark")
          : document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
      setTheme(newTheme);
    };

    window.addEventListener("theme-change", onThemeChange);
    window.addEventListener("storage", () => {
      try {
        const s = localStorage.getItem("theme") || localStorage.getItem("obey_theme");
        if (s === "dark" || s === "light") {
          setTheme(s);
          if (s === "dark") document.documentElement.classList.add("dark");
          else document.documentElement.classList.remove("dark");
        }
      } catch {}
    });

    return () => {
      window.removeEventListener("theme-change", onThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    applyTheme(next);
  };

  if (!mounted) {
    return (
      <button
        type="button"
        className={`p-2 rounded-xl border border-zinc-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-zinc-700 dark:text-zinc-300 ${className}`}
        aria-label="Toggle theme"
      >
        <Sun className="w-4 h-4 opacity-40" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
        theme === "dark"
          ? "bg-[#0b1424] hover:bg-slate-800 text-amber-300 border border-slate-700"
          : "bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300"
      } ${className}`}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle light/dark theme"
    >
      {theme === "dark" ? (
        <>
          <Sun className="w-4 h-4 text-amber-300" />
          {showLabel && <span className="text-[11px] font-bold">Light</span>}
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-zinc-800" />
          {showLabel && <span className="text-[11px] font-bold">Dark</span>}
        </>
      )}
    </button>
  );
}
