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

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") || localStorage.getItem("obey_theme");
    if (saved === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    localStorage.setItem("obey_theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
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
