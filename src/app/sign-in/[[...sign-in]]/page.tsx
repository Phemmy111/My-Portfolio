import { SignIn } from "@clerk/nextjs";
import { Bot } from "lucide-react";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Custom Obey Branding Header */}
        <Link href="/" className="flex flex-col items-center mb-6 group">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-600/25 mb-3 group-hover:scale-105 transition-transform">
            <Bot className="w-8 h-8 text-white font-bold" />
          </div>
          <h1 className="text-2xl font-black text-zinc-950 dark:text-white tracking-tight flex items-center gap-2">
            Obey Business
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
              AI 2.0
            </span>
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold mt-1">
            Sign in to your Business Control Room
          </p>
        </Link>

        <SignIn
          appearance={{
            elements: {
              card: "bg-white dark:bg-[#0a0a0a] border border-zinc-300 dark:border-zinc-800 shadow-2xl rounded-3xl",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "border border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white font-bold hover:bg-zinc-100 dark:hover:bg-[#141414]",
              formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-md shadow-emerald-600/20",
              formFieldInput: "bg-zinc-50 dark:bg-[#121212] border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white rounded-xl",
              footerActionLink: "text-emerald-600 dark:text-emerald-400 font-bold hover:underline",
              footer: "hidden",
              footerAction: "hidden",
            },
          }}
        />
      </div>
    </div>
  );
}
