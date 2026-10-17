import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Femi Adeleke | Developer · Automator · Educator",
  description:
    "Full-stack developer, automation engineer, and educator. Founder of AutoLearn Spot. Building smart web apps, AI workflows, and empowering creators globally.",
  keywords: [
    "Femi Adeleke",
    "AutoLearn Spot",
    "Full-Stack Developer",
    "n8n Automation",
    "Next.js Developer",
    "AI Automation",
    "Flutter Developer",
    "Music Producer",
  ],
  authors: [{ name: "Femi Adeleke" }],
  creator: "Femi Adeleke",
  openGraph: {
    type: "website",
    title: "Femi Adeleke | Developer · Automator · Educator",
    description:
      "Full-stack developer, automation engineer, and educator. Founder of AutoLearn Spot. Building smart web apps, AI workflows, and empowering creators globally.",
    siteName: "Femi Adeleke",
  },
  twitter: {
    card: "summary_large_image",
    title: "Femi Adeleke | Developer · Automator · Educator",
    description:
      "Full-stack developer, automation engineer, and educator. Founder of AutoLearn Spot. Building smart web apps, AI workflows, and empowering creators globally.",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/femi-headshot.webp", type: "image/webp" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const savedCookieTheme = cookieStore.get("theme")?.value || cookieStore.get("obey_theme")?.value;
  const isDark = savedCookieTheme === "dark";

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
        suppressHydrationWarning
      >
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    var saved = localStorage.getItem('theme') || localStorage.getItem('obey_theme');
                    if (saved === 'dark') {
                      document.documentElement.classList.add('dark');
                    } else if (saved === 'light') {
                      document.documentElement.classList.remove('dark');
                    }
                  } catch (e) {}
                })();
              `,
            }}
          />
        </head>
        <body className="min-h-full w-full flex flex-col overflow-x-hidden bg-[#f1f5f9] dark:bg-[#050b14] text-zinc-950 dark:text-slate-100 transition-colors duration-200">{children}</body>
      </html>
    </ClerkProvider>
  );
}
