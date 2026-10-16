import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Custom Obey Branding Header */}
        <Link href="/" className="flex flex-col items-center mb-6 group text-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-emerald-600/25 mb-3 group-hover:scale-105 transition-transform border border-emerald-500/20 bg-emerald-950/20">
            <Image
              src="/obey-logo.jpg"
              alt="Obey Logo"
              width={64}
              height={64}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-black text-zinc-950 dark:text-white tracking-tight flex items-center justify-center gap-2">
            Obey Business
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
              AI 2.0
            </span>
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold mt-1">
            Create your account & activate 7-Day Free Trial
          </p>
        </Link>

        {/* Clerk Sign Up Card */}
        <div className="w-full">
          <SignUp
            appearance={{
              elements: {
                card: "bg-white dark:bg-[#0a0a0a] border border-zinc-300 dark:border-zinc-800 shadow-2xl rounded-3xl",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "border border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white font-bold hover:bg-zinc-100 dark:hover:bg-[#141414]",
                formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-md shadow-emerald-600/20",
                formFieldInput: "bg-zinc-50 dark:bg-[#121212] border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white rounded-xl",
                footerActionLink: "text-emerald-600 dark:text-emerald-400 font-bold hover:underline",
                footerAction__securedBy: "hidden",
              },
            }}
          />
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-4 text-center">
          Already registered?{" "}
          <Link href="/sign-in" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
            Sign in to Control Room
          </Link>
        </p>
      </div>
    </div>
  );
}
