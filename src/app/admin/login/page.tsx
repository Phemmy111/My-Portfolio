"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";

export default function AdminLoginPage() {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid passcode");
      }

      router.push("/admin");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex items-center justify-center p-6 text-zinc-950 dark:text-white">
      <div className="w-full max-w-md bg-white dark:bg-[#080808] border border-zinc-300 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="text-center space-y-3 mb-8">
          <div className="relative w-16 h-16 mx-auto rounded-full overflow-hidden border-2 border-zinc-400 dark:border-zinc-700 shadow-md">
            <Image
              src="/femi-headshot.webp"
              alt="Femi Adeleke"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Command Center</h1>
            <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mt-1">
              Femi Adeleke · Admin & Freelance Engine
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-2">
              Admin Passcode
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter access passcode..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212] text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-black dark:focus:border-zinc-500 font-mono text-sm tracking-wider shadow-xs"
              />
              <Lock size={16} className="absolute left-3.5 top-3.5 text-zinc-500" />
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1.5 font-medium">
              Default passcode: <code className="font-mono text-emerald-600 dark:text-emerald-400">femi2026</code>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 hover:scale-[1.01]"
          >
            {loading ? (
              "Authenticating..."
            ) : (
              <>
                Unlock Dashboard
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" />
            Protected Route
          </span>
          <a href="/" className="hover:underline text-black dark:text-white">
            ← Return to Portfolio
          </a>
        </div>
      </div>
    </div>
  );
}
