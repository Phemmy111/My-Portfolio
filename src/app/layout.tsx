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
  metadataBase: new URL("https://obeyai.vercel.app"),
  title: "Obey AI — 24/7 Autonomous WhatsApp Sales & Business AI",
  description:
    "Turn your WhatsApp & website into an autonomous 24/7 sales machine. Auto-save contacts to your phone without freezes, reply instantly to price inquiries, dispatch personalized broadcasts, and take 100% free WebRTC voice calls.",
  keywords: [
    "Obey AI",
    "Obey Business",
    "WhatsApp AI Bot",
    "WhatsApp Automation",
    "WhatsApp CRM",
    "Auto-save WhatsApp Contacts",
    "WebRTC Voice Hotline",
    "AI Sales Assistant",
    "Femi Adeleke",
  ],
  authors: [{ name: "Obey AI" }, { name: "Femi Adeleke", url: "https://obeyai.vercel.app/portfolio" }],
  creator: "Obey AI",
  publisher: "Obey AI",
  openGraph: {
    type: "website",
    title: "Obey AI — 24/7 Autonomous WhatsApp Sales & Business AI",
    description:
      "Turn your WhatsApp & website into an autonomous 24/7 sales machine. Auto-save contacts, reply to customer inquiries, dispatch broadcasts, and take live WebRTC voice calls.",
    siteName: "Obey AI",
    url: "https://obeyai.vercel.app",
    images: [
      {
        url: "/obey-logo.jpg",
        width: 800,
        height: 800,
        alt: "Obey AI Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Obey AI — 24/7 Autonomous WhatsApp Sales & Business AI",
    description:
      "Turn your WhatsApp & website into an autonomous 24/7 sales machine. Auto-save contacts, reply to inquiries, dispatch broadcasts, and take live voice calls.",
    images: ["/obey-logo.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
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
