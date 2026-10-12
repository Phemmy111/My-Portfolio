import { GitFork, MessageCircle } from "lucide-react";
import { PERSONAL } from "@/lib/data";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-400/40 dark:border-zinc-800 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div>
          <p className="font-black text-lg">
            <span className="gradient-text">{PERSONAL.name}</span>
          </p>
          <p className="text-xs text-zinc-800 dark:text-zinc-400 mt-1 font-bold">
            {PERSONAL.brand} · {PERSONAL.location}
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-3">
          <a
            href={PERSONAL.github}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-full border border-zinc-400 dark:border-zinc-800 bg-white/80 dark:bg-[#080808] text-zinc-900 dark:text-zinc-300 hover:border-black dark:hover:border-zinc-600 hover:text-black dark:hover:text-white transition-all shadow-2xs"
            aria-label="GitHub"
          >
            <GitFork size={16} />
          </a>
          <a
            href={`https://wa.me/234${PERSONAL.whatsapp.replace(/^0/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-full border border-zinc-400 dark:border-zinc-800 bg-white/80 dark:bg-[#080808] text-zinc-900 dark:text-zinc-300 hover:border-emerald-600 hover:text-emerald-500 transition-all shadow-2xs"
            aria-label="WhatsApp"
          >
            <MessageCircle size={16} />
          </a>
        </div>

        {/* Copyright & Admin Command Center */}
        <div className="flex items-center gap-2.5 text-xs text-zinc-800 dark:text-zinc-400 font-bold">
          <span>© {year} {PERSONAL.name}.</span>
          <span>·</span>
          <a
            href="/admin"
            className="text-zinc-600 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
            title="Admin Command Center"
          >
            Admin
          </a>
        </div>
      </div>
    </footer>
  );
}
