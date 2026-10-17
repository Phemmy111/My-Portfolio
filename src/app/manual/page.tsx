"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import {
  BookOpen,
  Sparkles,
  Zap,
  Users,
  Radio,
  PhoneCall,
  FolderPlus,
  Send,
  CheckCircle2,
  FileCode,
  FileText,
  Search,
  ArrowRight,
  ShieldCheck,
  Building2,
  Smile,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface GuideSection {
  id: string;
  category: "starter" | "plans" | "contacts" | "broadcast" | "status" | "voice" | "ai" | "faq";
  title: string;
  badge?: string;
  badgeColor?: string;
  summary: string;
  steps: string[];
  tips?: string[];
  planRequirement?: string;
}

export default function ManualPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expandedSection, setExpandedSection] = useState<string | null>("plans");

  // Dynamic Platform Pricing from API
  const [platformPricing, setPlatformPricing] = useState({
    starter_price: 9500,
    pro_price: 22500,
    enterprise_price: 55000,
    trial_days: 7,
  });

  useEffect(() => {
    fetch("/api/obey/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setPlatformPricing(data.pricing);
      })
      .catch(() => {});
  }, []);

  const categories = [
    { id: "all", label: "All Guides" },
    { id: "plans", label: "💎 Plans & Quotas" },
    { id: "starter", label: "🚀 Getting Started" },
    { id: "contacts", label: "👥 Contacts & Buckets" },
    { id: "broadcast", label: "📢 WhatsApp Broadcast" },
    { id: "status", label: "👁️ Status Automator" },
    { id: "voice", label: "🎙️ Voice Hotline" },
    { id: "ai", label: "⚙️ n8n & AI Tools" },
    { id: "faq", label: "❓ FAQ & Troubleshooting" },
  ];

  const sections: GuideSection[] = useMemo(() => [
    {
      id: "plans",
      category: "plans",
      title: "Plan Comparison Matrix & Feature Limits",
      badge: "Core Reference",
      badgeColor: "bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-400 border border-purple-300 dark:border-purple-500/20",
      planRequirement: "All Plans",
      summary:
        "Understand exactly what features, quotas, contact bucket limits, and voice hours are unlocked for each commercial tier.",
      steps: [
        `Starter Plan (₦${platformPricing.starter_price.toLocaleString()} / month): Perfect for solo creators and emerging brands starting out with AI automation. Includes 1 single business workspace, 250 auto-saved customer leads, 10 keyword auto-responders, 15 hours/month of WebRTC voice calls, 2 contact buckets, and 1-tap VCF / CSV phone contact export.`,
        `Pro Business Plan (₦${platformPricing.pro_price.toLocaleString()} / month) — Most Popular: Built for active businesses looking to scale WhatsApp sales. Includes a ${platformPricing.trial_days}-Day 100% Free Trial, UNLIMITED auto-saved customer leads, 50 keyword auto-responders, 50 hours/month of WebRTC voice calls, audio recordings & full executive transcripts delivered on WhatsApp, custom business catalog with direct bank payment details, personalized WhatsApp broadcasts, and up to 10 contact buckets.`,
        `Enterprise / Founder Plan (₦${platformPricing.enterprise_price.toLocaleString()} / month): Engineered for high-volume multi-brand founders, agencies, and enterprise operations. Includes multi-business management (up to 2 distinct workspaces), full multi-tenant WhatsApp bot, UNLIMITED voice hotline minutes, UNLIMITED contact buckets, autonomous n8n workflows & interactive web app generation, custom AI agent tuning, and dedicated 24/7 priority engineer support.`,
      ],
      tips: [
        "You can upgrade or switch plans anytime from your Control Room. Your quotas expand immediately upon Paystack confirmation.",
        "Need more than 2 enterprise workspaces? Reach out directly to Femi Adeleke on WhatsApp (+234 812 093 4828) for custom multi-tenant provisioning.",
      ],
    },
    {
      id: "whatsapp-connect",
      category: "starter",
      title: "Connecting Your WhatsApp Number (QR Code & Pairing Code)",
      badge: "Step 1",
      badgeColor: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20",
      planRequirement: "All Plans",
      summary:
        "Connect your WhatsApp business account or personal phone in less than 30 seconds without leaving your browser.",
      steps: [
        "Log into your Obey Control Room and click on the 'WhatsApp Connect' tab in the navigation menu.",
        "Choose your preferred pairing method: 'Scan QR Code' (recommended for laptop users) or '8-Digit Pairing Code' (recommended if browsing on your mobile phone).",
        "If using QR Code: Open WhatsApp on your phone ➔ Tap Settings (iOS) or Three Dots ⋮ (Android) ➔ Linked Devices ➔ Link a Device ➔ Point your camera at the QR code.",
        "If using Pairing Code: Enter your WhatsApp phone number with country code (e.g. +234 812 093 4828) and tap 'Request Pairing Code'. A notification will pop up in your phone's WhatsApp asking you to verify the 8-digit code.",
        "Once verified, the status badge turns into a glowing green 'Connected — Live' badge. Obey is now actively listening and managing your customer chats!",
      ],
      tips: [
        "Obey uses official WhatsApp Multi-Device protocol. Your existing chats, personal messages, and media remain 100% private and untouched.",
        "You can disconnect or re-pair another number anytime by clicking 'Disconnect' in the WhatsApp Connect room.",
      ],
    },
    {
      id: "contacts-autosaver",
      category: "contacts",
      title: "Contacts Management, Auto-Saver & WhatsApp Status View Booster",
      badge: "Audience Growth",
      badgeColor: "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 border border-blue-300 dark:border-blue-500/20",
      planRequirement: "All Plans",
      summary:
        "Automatically detect and save every new customer who messages you on WhatsApp so they can immediately view your WhatsApp Status stories.",
      steps: [
        "Open the 'Contacts & Auto-Saver' tab in your Control Room.",
        "Three Specialized Lists: Easily switch between 'All Contacts', 'Unsaved Numbers (Lead Potential)', and 'Saved in Phone'.",
        "WhatsApp Status View Rule: WhatsApp ONLY allows users to see your status updates if both parties have each other's numbers saved in their phone address book. The 'Unsaved Numbers' tab highlights every contact who has chatted with you but isn't saved in your phone address book yet.",
        "Auto-Save Contacts: Leave the 'Auto-Save' toggle ON. Obey will automatically store and index any new incoming number who reaches out to your business.",
        "1-Click 'Save All Unsaved': Click the blue 'Save All Unsaved' button to export all pending leads as a mobile address book .VCF file. Open this file on your iPhone or Android to add hundreds of contacts in 3 seconds!",
        "Manual Checkboxes: Select specific contacts with checkboxes to export a custom selection or group them into a Bucket.",
      ],
      tips: [
        "Contacts saved via Obey will instantly start viewing your WhatsApp Status updates within 24 hours.",
        "Download your contact list anytime as an Excel CSV or Google Contacts-compatible file.",
      ],
    },
    {
      id: "contact-buckets",
      category: "contacts",
      title: "Audience Segmentation: Creating & Managing Contact Buckets",
      badge: "Targeted Sales",
      badgeColor: "bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-400 border border-purple-300 dark:border-purple-500/20",
      planRequirement: "Starter (2), Pro (10), Enterprise (Unlimited)",
      summary:
        "Group your contacts into custom buckets (e.g. 'VIP Clients', 'Retail Buyers', 'Follow-Ups') for laser-targeted broadcasts and WhatsApp voice notes.",
      steps: [
        "In the 'Contacts & Auto-Saver' tab, click on the 'Contact Buckets' view button or click '+ Save as Bucket' after selecting contacts.",
        "Give your bucket a recognizable name (e.g. 'Wholesale Buyers' or 'Bucket 1').",
        "Add Contacts: Use the built-in search filter to check off individual contacts, or click 'Select All' to include all filtered leads.",
        "Edit Buckets Anytime: Click 'Edit Contacts' on any bucket card to add or remove numbers as your audience grows.",
        "WhatsApp Delegation: You can tell Obey on WhatsApp: 'deliver this message to Bucket 1: We are offering 15% off all shoe orders today!'. Obey will locate the bucket, confirm with you, and send it immediately.",
      ],
      tips: [
        "Starter workspaces can create up to 2 buckets. Pro workspaces unlock 10 buckets, and Enterprise unlocks unlimited buckets.",
        "Bucket names can be mentioned directly in conversation with Obey on WhatsApp.",
      ],
    },
    {
      id: "whatsapp-broadcast",
      category: "broadcast",
      title: "Personalized WhatsApp Broadcasts & Campaigns",
      badge: "Mass Outreach",
      badgeColor: "bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20",
      planRequirement: "Pro & Enterprise",
      summary:
        "Broadcast promotions, announcements, and follow-ups to hundreds of contacts simultaneously with dynamic personalized tags.",
      steps: [
        "Click the green 'Broadcast' button in your Control Room header, or select contacts and click 'Send Broadcast'.",
        "Choose Your Audience: Select 'All Contacts', 'A Contact Bucket', or 'Pick Individual Contacts'.",
        "Scrollable Contact Picker: Use the responsive, scrollable contact picker with real-time name & phone search to pick specific recipients.",
        "Merge Tags: Insert {name} to personalize each message with the contact's real saved name (e.g. 'Hello {name}, your package is ready!').",
        "Safe Delivery Debounce: Obey includes built-in anti-spam spacing between messages so your WhatsApp number stays in great health.",
      ],
      tips: [
        "Always test your broadcast draft by selecting just your own phone number first to preview formatting.",
        "Combine broadcasts with emoji reactions for maximum click-through and reply rates.",
      ],
    },
    {
      id: "status-automator",
      category: "status",
      title: "WhatsApp Status Automator & AI Story Generator",
      badge: "24/7 Presence",
      badgeColor: "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 border border-blue-300 dark:border-blue-500/20",
      planRequirement: "All Plans",
      summary:
        "Publish text and media stories directly from your browser, generate viral status copy, view contacts' stories automatically, and auto-comment with human warmth.",
      steps: [
        "Navigate to the 'Status Automator' tab in your Control Room.",
        "Posting a Quick Status: Type your text in the status box, or upload an image (JPG, PNG) or video (MP4, MOV).",
        "Video Status Trimming: Obey automatically transcodes and formats video stories so they match WhatsApp's 90-second story specifications without bad gateway errors.",
        "AI Status Copy Generator: Enter a topic (e.g. 'Monday morning motivation for founders' or 'New weekend discount') and click 'Generate 3 Variations'. Pick your favorite and post with 1 click!",
        "Delete Status from Control Room: Every status you post appears in the 'Live Status History' feed. You can review view counts and click the red trash icon to delete it from WhatsApp immediately.",
        "Automatic Viewing & AI Commenting: Switch on the 'Auto View & AI Comment' toggle. Obey will autonomously view incoming status updates from your contacts and leave warm, witty, context-aware comments directly under their posts!",
        "Continuity Guarantee: When a contact replies to Obey's status comment, Obey remembers the exact status story and comment, replying seamlessly without treating them like a stranger.",
        "Status Comment Exclusion List (Opt-Outs): If any contact requests not to receive automated status comments, Obey automatically detects this and adds them to your Exclusion List when they text 'Stop commenting on my status' or 'Don't comment on my story'. You can also manually add numbers or exclude contacts from the Control Room with 1 click.",
        "Re-allowing Status Engagement: You can unblock or re-allow any contact anytime by clicking 'Re-allow Comments' in the Status tab Exclusion card, or directly on their row in the Leads & Contacts directory.",
      ],
      tips: [
        "Choose your AI comment tone ('friendly', 'professional', 'authentic_naija', or 'direct') in the settings card.",
        "Obey automatically avoids commenting on automated bot posts to prevent endless reply loops.",
        "Status Exclusion Safety: Excluded contacts still receive full customer support when they text your business, but Obey will NEVER leave automated comments on their WhatsApp stories.",
      ],
    },
    {
      id: "voice-hotline",
      category: "voice",
      title: "WebRTC Voice Call Hotline & AI Voice Profile",
      badge: "Zero Airtime",
      badgeColor: "bg-teal-100 dark:bg-teal-500/10 text-teal-800 dark:text-teal-400 border border-teal-300 dark:border-teal-500/20",
      planRequirement: "Starter (15h), Pro (50h), Enterprise (Unlimited)",
      summary:
        "Give your customers a free browser voice call link to talk directly with Obey. Select custom voice accents, personalities, and opening greetings.",
      steps: [
        "Navigate to 'AI Brain & Settings' ➔ Card 3: 'WebRTC Voice Call Hotline'.",
        "Voice Accent & Gender: Choose between 'Nigerian Male (Warm Executive)', 'Nigerian Female', 'British Male/Female', or 'American Male/Female'.",
        "Personality & Tone: Pick between 'Professional', 'Friendly (Warm Brotherly)', 'Authentic Naija (Pidgin & sharp-sharp)', or 'Direct & Punchy'.",
        "Opening Greeting: Customize what Obey says when a caller connects (e.g. 'Hello! You have reached Havilah Touch. How can I assist you with our agricultural packages today?').",
        "Zero-Airtime Call Link: Share your link (e.g. https://femiadelekeportfolio.vercel.app/call?biz=your-slug) in your Instagram bio, WhatsApp catalog, or website.",
        "Audio Recordings & Transcripts: Delivered straight to your WhatsApp as soon as each call ends (Pro and Enterprise tiers).",
      ],
      tips: [
        "Callers do not need to download any app. The call connects in crystal-clear HD audio directly in their mobile browser.",
        "Starter workspaces receive 15 hours of calling per month. Pro workspaces receive 50 hours/month, and Enterprise is unlimited.",
      ],
    },
    {
      id: "ai-n8n-tools",
      category: "ai",
      title: "n8n Workflow Generation & Interactive Web Apps",
      badge: "Power Tools",
      badgeColor: "bg-indigo-100 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-500/20",
      planRequirement: "Pro & Enterprise",
      summary:
        "Request custom n8n workflows, automation blueprints, or full HTML web apps straight from your WhatsApp chat with Obey.",
      steps: [
        "Message Obey on WhatsApp: 'Create an n8n workflow for lead qualification with Google Sheets and OpenAI'.",
        "Obey asks clarifying questions naturally to understand your database nodes, credentials, and business logic.",
        "Production-Ready JSON Generation: Obey provides a live interactive artifact link AND an executable JSON file that you can import straight into your n8n canvas.",
        "Visual Bug Diagnosis: Send Obey a screenshot of an n8n canvas error or node crash. Obey analyzes the image, identifies the bad parameter or missing credential, and delivers the exact fix.",
        "Web App Prototypes: Ask Obey to build calculators, lead forms, or client portals. Obey delivers an interactive URL and downloadable file instantly.",
      ],
      tips: [
        "Obey's computer vision can read error logs, JSON payloads, and node status colors directly from mobile screenshots.",
        "Artifacts are permanently hosted at /artifact/[id] and can be shared with your clients or developers.",
      ],
    },
    {
      id: "companion-chat",
      category: "ai",
      title: "Chatting with Obey: Stickers, Reactions & Voice Notes",
      badge: "Companion",
      badgeColor: "bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20",
      planRequirement: "All Plans",
      summary:
        "Speak to Obey naturally as your loyal 24/7 companion. Send stickers, audio voice notes, or delegate tasks using everyday conversational speech.",
      steps: [
        "Direct Contact Search & Messaging: Tell Obey: 'Help me message Femi'. Obey searches your contacts, lists the matches, and asks which one you want to contact and what message to deliver.",
        "Bucket Delegation: Say 'Deliver this message to Bucket 1: Team meeting rescheduled to 3 PM'. Obey prepares the broadcast and requests your confirmation.",
        "Sticker Recognition: Send any WhatsApp sticker to Obey. Obey sees the sticker and reacts with appropriate emojis (❤️, 🔥, 😂) and witty banter instead of dropping it.",
        "Automatic Reactions: Obey reacts to compliments ('Thank you', 'Well done') with ❤️ or 🙏, celebrations with 🔥, and affirmations with 👍.",
        "Voice Notes: Obey understands natural Nigerian English, Pidgin, and colloquial speech in voice notes. Speak freely without scripting.",
      ],
      tips: [
        "Obey will never execute an outbound message without your explicit confirmation ('Yes', 'Send', 'Approve').",
        "To teach Obey something permanently, simply say: 'Remember that my brand name is Havilah Touch' or 'Never mention pricing before pitching the value'.",
      ],
    },
    {
      id: "faq",
      category: "faq",
      title: "Frequently Asked Questions & Troubleshooting",
      badge: "Help & FAQ",
      badgeColor: "bg-zinc-100 dark:bg-slate-500/10 text-zinc-800 dark:text-slate-300 border border-zinc-300 dark:border-slate-700/40",
      planRequirement: "All Plans",
      summary: "Quick answers to common questions about WhatsApp connection, status views, and account setup.",
      steps: [
        "Q: Why can't a contact see my WhatsApp Status updates?\nA: WhatsApp requires reciprocal contact saving. You must save their number in your phone address book, and they must save your number. Use Obey's 'Save All Unsaved' and download the .VCF file to ensure all contacts are saved in your phone.",
        "Q: Does Obey auto-reply to my personal friends and family?\nA: For business workspaces, Obey ONLY auto-replies to incoming customer inquiries based on your catalog and keyword rules. You can also turn on human takeover anytime. For the business owner, Obey acts exclusively as their private assistant.",
        "Q: What happens if Evolution API disconnects?\nA: Obey runs a background heartbeat health checker. If a connection drops, your Control Room displays a re-connect alert, and you can re-scan your QR code in 5 seconds without losing any data or leads.",
        "Q: Can I change my voice accent and opening greeting later?\nA: Yes! Go to 'AI Brain & Settings' in the Control Room anytime to switch voices, tweak your business bio, or update catalog pricing.",
        `Q: What are the subscription pricing rates?\nA: Starter is ₦${platformPricing.starter_price.toLocaleString()}/month, Pro is ₦${platformPricing.pro_price.toLocaleString()}/month (includes ${platformPricing.trial_days}-day 100% free trial), and Enterprise is ₦${platformPricing.enterprise_price.toLocaleString()}/month. Subscriptions are billed securely in Nigerian Naira (NGN) via Paystack.`,
      ],
    },
  ], [platformPricing]);

  const filteredSections = useMemo(() => {
    return sections.filter((s) => {
      const matchesCategory = activeCategory === "all" || s.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.steps.some((step) => step.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [sections, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-[#050b14] text-zinc-900 dark:text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-950 dark:selection:text-white transition-colors duration-200">
      {/* Top Header */}
      <header className="border-b border-zinc-300/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#060d1a]/90 backdrop-blur-xl sticky top-0 z-40 transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-black text-base sm:text-lg text-zinc-950 dark:text-white tracking-tight flex items-center gap-2 hover:opacity-80 transition"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-purple-600/30">
                ⚡
              </div>
              <span>Obey Knowledge Hub</span>
            </Link>
            <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
              v2.5 Production
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle showLabel={true} />
            <Link
              href="/control-room"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <span>Control Room</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-zinc-300/80 dark:border-slate-800/60 bg-white/50 dark:bg-gradient-to-b dark:from-purple-950/20 dark:via-slate-950 dark:to-slate-950 py-12 px-4 transition-colors">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700/50 text-purple-800 dark:text-purple-300 text-xs font-semibold">
            <BookOpen className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Complete User Manual & Feature Documentation</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-zinc-950 dark:text-white tracking-tight leading-tight">
            Everything you can do with{" "}
            <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-emerald-600 dark:from-purple-400 dark:via-pink-400 dark:to-emerald-400 bg-clip-text text-transparent">
              Obey Business AI
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            From WhatsApp QR pairing to automated contact saving, multi-bucket segmentation, scheduled status updates, voice calls, and n8n workflows — explore how to unleash Obey for your business.
          </p>

          {/* Search Box */}
          <div className="max-w-xl mx-auto pt-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Search manual (e.g. buckets, status views, voice hotline, n8n, pricing)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900/90 border border-zinc-300 dark:border-slate-800 rounded-2xl pl-10 pr-10 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-purple-500 shadow-sm dark:shadow-xl transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeCategory === c.id
                  ? "bg-emerald-600 dark:bg-purple-600 text-white font-bold shadow-md shadow-emerald-600/20 dark:shadow-purple-600/30"
                  : "bg-white dark:bg-slate-900 text-zinc-700 dark:text-slate-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-300 dark:border-slate-800 hover:bg-zinc-100 dark:hover:bg-slate-850 shadow-2xs"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Guides Accordion / List */}
        <div className="space-y-4">
          {filteredSections.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-zinc-300 dark:border-slate-800 rounded-2xl space-y-3 bg-white/40 dark:bg-slate-900/20">
              <Search className="w-8 h-8 text-zinc-400 dark:text-slate-600 mx-auto" />
              <h3 className="font-bold text-zinc-900 dark:text-white text-base">No manual guides matched your search</h3>
              <p className="text-xs text-zinc-600 dark:text-slate-400">
                Try searching for keywords like &ldquo;plans&rdquo;, &ldquo;contacts&rdquo;, &ldquo;status&rdquo;, &ldquo;hotline&rdquo;, or &ldquo;broadcast&rdquo;.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("all");
                }}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-slate-800 hover:bg-zinc-300 dark:hover:bg-slate-700 text-zinc-900 dark:text-white text-xs font-semibold cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          ) : (
            filteredSections.map((sec) => {
              const isExpanded = expandedSection === sec.id;
              return (
                <div
                  key={sec.id}
                  id={sec.id}
                  className="bg-white dark:bg-slate-900/90 border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl overflow-hidden transition shadow-sm"
                >
                  {/* Card Header (Click to toggle) */}
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : sec.id)}
                    className="w-full p-5 sm:p-6 text-left flex items-start justify-between gap-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-850/50 transition"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {sec.badge && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sec.badgeColor}`}
                          >
                            {sec.badge}
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 border border-zinc-300 dark:border-slate-700">
                          {sec.planRequirement}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                        {sec.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">
                        {sec.summary}
                      </p>
                    </div>

                    <div className="p-2 rounded-xl bg-zinc-100 dark:bg-slate-800/80 text-zinc-600 dark:text-slate-400 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-900 dark:text-white" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Card Body (Detailed Steps & Tips) */}
                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-zinc-200 dark:border-slate-800/70 space-y-4 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-purple-400 mb-2.5">
                          Step-by-Step Instructions & Workflow:
                        </h4>
                        <div className="space-y-2">
                          {sec.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-slate-950/60 border border-zinc-200 dark:border-slate-800/70 text-xs sm:text-sm text-zinc-800 dark:text-slate-200 leading-relaxed"
                            >
                              <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-purple-500/20 text-emerald-800 dark:text-purple-300 border border-emerald-300 dark:border-purple-500/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <div className="flex-1 whitespace-pre-line">{step}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {sec.tips && sec.tips.length > 0 && (
                        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 space-y-1.5">
                          <h5 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Pro Tips & Best Practices:</span>
                          </h5>
                          <ul className="space-y-1 text-xs text-emerald-900 dark:text-emerald-200/90 list-disc list-inside">
                            {sec.tips.map((tip, i) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-between border-t border-zinc-200 dark:border-slate-800/60 text-xs text-zinc-500 dark:text-slate-400">
                        <span>Need live assistance with this step?</span>
                        <Link
                          href="/control-room"
                          className="text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                        >
                          Try in Control Room &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom CTA Card */}
        <section className="bg-white dark:bg-gradient-to-r dark:from-purple-950/40 dark:via-slate-900 dark:to-emerald-950/40 border border-zinc-300 dark:border-purple-800/40 rounded-3xl p-6 sm:p-10 text-center space-y-4 shadow-sm dark:shadow-2xl">
          <h2 className="text-xl sm:text-3xl font-black text-zinc-950 dark:text-white">
            Ready to Automate Your Business?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-slate-300 max-w-xl mx-auto">
            Launch your dedicated AI business companion right now. Start with our {platformPricing.trial_days}-day 100% free trial on the Pro plan or configure your Starter workspace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/control-room"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm transition shadow-md shadow-emerald-600/20"
            >
              Open Control Room
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-slate-800 hover:bg-zinc-200 dark:hover:bg-slate-700 text-zinc-800 dark:text-slate-200 font-bold text-xs sm:text-sm transition border border-zinc-300 dark:border-slate-700"
            >
              Back to Home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
