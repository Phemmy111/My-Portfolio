import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full w-full flex flex-col overflow-x-hidden">{children}</body>
      </html>
    </ClerkProvider>
  );
}
