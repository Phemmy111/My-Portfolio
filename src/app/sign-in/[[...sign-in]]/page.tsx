import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        <SignIn
          appearance={{
            elements: {
              card: "bg-white dark:bg-[#0a0a0a] border border-zinc-300 dark:border-zinc-800 shadow-2xl rounded-3xl",
              headerTitle: "text-zinc-950 dark:text-white font-black",
              headerSubtitle: "text-zinc-600 dark:text-zinc-400 font-semibold",
              socialButtonsBlockButton: "border border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white font-bold hover:bg-zinc-100 dark:hover:bg-[#141414]",
              formButtonPrimary: "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200",
              formFieldInput: "bg-zinc-50 dark:bg-[#121212] border-zinc-300 dark:border-zinc-800 text-zinc-950 dark:text-white",
              footerActionLink: "text-emerald-600 dark:text-emerald-400 font-bold hover:underline",
            },
          }}
        />
      </div>
    </div>
  );
}
