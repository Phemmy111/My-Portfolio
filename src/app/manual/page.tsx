"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
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

  const sections: GuideSection[] = [
    {
      id: "plans",
      category: "plans",
      title: "Plan Comparison Matrix & Feature Limits",
      badge: "Core Reference",
      badgeColor: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
      planRequirement: "All Plans",
      summary:
        "Understand exactly what features, quotas, contact bucket limits, and voice hours are unlocked for each commercial tier.",
      steps: [
        "Starter Plan (₦15,000 / month): Perfect for solo creators and emerging brands starting out with AI automation. Includes 1 single business workspace, 250 auto-saved customer leads, 10 keyword auto-responders, 15 hours/month of WebRTC voice calls, 2 contact buckets, and 1-tap VCF / CSV phone contact export.",
        "Pro Business Plan (₦45,000 / month) — Most Popular: Built for active businesses looking to scale WhatsApp sales. Includes a 7-Day 100% Free Trial, UNLIMITED auto-saved customer leads, 50 keyword auto-responders, 50 hours/month of WebRTC voice calls, audio recordings & full executive transcripts delivered on WhatsApp, custom business catalog with direct bank payment details, personalized WhatsApp broadcasts, and up to 10 contact buckets.",
        "Enterprise / Founder Plan (₦120,000 / month): Engineered for high-volume multi-brand founders, agencies, and enterprise operations. Includes multi-business management (up to 2 distinct workspaces), full multi-tenant WhatsApp bot, UNLIMITED voice hotline minutes, UNLIMITED contact buckets, autonomous n8n workflows & interactive web app generation, custom AI agent tuning, and dedicated 24/7 priority engineer support.",
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
      badgeColor: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
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
      badgeColor: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
      planRequirement: "All Plans",
      summary:
        "Automatically detect and save every new customer who messages you on WhatsApp so they can immediately view your WhatsApp Status stories.",
      steps: [
        "Navigate to 'Contacts & Auto-Saver' in your Control Room.",
        "Three distinct tabs organize your audience: 'All Contacts', 'Unsaved Numbers', and 'Saved in Phone'.",
        "WhatsApp Status View Rule: WhatsApp ONLY allows users to see your status updates if both parties have each other's numbers saved in their phone address book. The 'Unsaved Numbers' tab highlights every contact who has chatted with you but isn't saved in your phone address book yet.",
        "Click the glowing '⚡ Save All Unsaved' button to mark all pending contacts as saved in one click.",
        "Click 'Save to Phone (VCF)' to download a vCard file. Open it on your iPhone, Android, or Google Contacts to instantly import all numbers with zero manual typing!",
        "Keep the 'Auto-Save Engine' toggle switched ON: Obey will automatically capture and index every new customer who chats with your business in real time.",
      ],
      tips: [
        "Regularly export the .VCF file once a week to sync all new leads into your physical phone address book.",
        "Use the CSV export to import your leads into CRM platforms or Google Sheets for follow-up marketing campaigns.",
      ],
    },
    {
      id: "contact-buckets",
      category: "contacts",
      title: "Creating & Managing Contact Buckets",
      badge: "Smart Segmentation",
      badgeColor: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
      planRequirement: "Starter (2), Pro (10), Enterprise (Unlimited)",
      summary:
        "Group specific contacts into named buckets (e.g., 'Bucket 1', 'VIP Clients', 'Wholesale Buyers') to broadcast messages with 1 click or via WhatsApp voice commands.",
      steps: [
        "Go to 'Contacts & Auto-Saver' ➔ Select the 'Contact Buckets' tab.",
        "Click '+ Create Bucket' (or tick checkboxes next to contacts in 'All Contacts' and click 'Save as Bucket').",
        "In the bucket modal, enter a Bucket Name (e.g. 'Bucket 1' or 'High Spenders') and an optional description.",
        "Use the searchable contact picker right inside the modal: search by name, phone, or notes, and tick the contacts you want to include. You can also click 'Select All' or 'Clear'.",
        "Click 'Save Bucket'. Your bucket is now active and ready for broadcasts!",
        "Managing contacts: Click 'Edit Contacts' on any bucket card to add new contacts or remove existing ones anytime.",
        "WhatsApp Voice Delegation: You can tell Obey directly on WhatsApp: 'Deliver this message to Bucket 1: Flash sale starts at 5 PM!'. Obey will recognize your bucket and ask for confirmation before dispatching!",
      ],
      tips: [
        "Use buckets for repeat customers, high-ticket prospects, students, or regional groups.",
        "Buckets eliminate the need to create clunky WhatsApp broadcast lists manually inside the phone.",
      ],
    },
    {
      id: "whatsapp-broadcast",
      category: "broadcast",
      title: "Dispatching Personalized WhatsApp Broadcasts",
      badge: "High Engagement",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      planRequirement: "Pro & Enterprise",
      summary:
        "Send personalized WhatsApp messages to hundreds of customers without landing in WhatsApp spam filters or getting flagged.",
      steps: [
        "Click the 'Broadcast' button in the Contacts & Auto-Saver tab (or on any saved Contact Bucket).",
        "Select your Target Audience: Choose 'Segment' (All Leads, Customers, or Interested Prospects), 'Specific (Pick Contacts)', or 'Bucket (Saved List)'.",
        "If choosing 'Specific Contacts', use the scrollable contact picker and search filter to select the exact recipients.",
        "Craft your Message Template: Obey supports dynamic merge tags: {name} inserts the recipient's first name, and {business} inserts your company name.",
        "Check the Live Preview at the bottom of the form to verify how your message will read for a recipient like Chioma.",
        "Click 'Send Broadcast'. Obey dispatches messages with randomized human-like delays (3-7 seconds) to protect your WhatsApp account health.",
      ],
      tips: [
        "Always personalize messages with {name} to boost open and reply rates by over 60%.",
        "Avoid sending identical messages to thousands of strangers in minutes; broadcast to opted-in leads who have chatted with your number.",
      ],
    },
    {
      id: "status-automator",
      category: "status",
      title: "WhatsApp Status Automator & AI Story Generator",
      badge: "24/7 Presence",
      badgeColor: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
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
      badgeColor: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
      planRequirement: "Starter (15h), Pro (50h), Enterprise (Unlimited)",
      summary:
        "Give your customers a free browser voice call link to talk directly with Obey. Select custom voice accents, personalities, and opening greetings.",
      steps: [
        "Navigate to 'AI Brain & Settings' ➔ Card 3: 'WebRTC Voice Call Hotline'.",
        "Voice Accent & Gender: Choose between 'Nigerian Male (Warm Executive)', 'Nigerian Female', 'British Male/Female', or 'American Male/Female'.",
        "Personality & Tone: Pick between 'Professional', 'Friendly (Warm Brotherly)', 'Authentic Naija (Pidgin & sharp-sharp)', or 'Direct & Punchy'.",
        "Opening Greeting: Customize what Obey says when a caller connects (e.g. 'Hello! You have reached Havilah Touch. How can I assist you with our agricultural packages today?').",
        "Click 'Save Brain Settings' at the top or bottom of the page.",
        "Share Your Hotline Link: Copy your unique link (/call?biz=your-slug) and paste it into your Instagram bio, WhatsApp bio, website button, or email signature.",
        "Pro Feature: When a customer completes a voice call, Obey automatically delivers the full audio recording and executive transcript straight to your WhatsApp!",
      ],
      tips: [
        "WebRTC calls run over internet data (Wi-Fi or cellular) and incur zero international airtime charges for your callers.",
        "Test your call experience anytime by clicking 'Test Live Call &rarr;' in the Control Room.",
      ],
    },
    {
      id: "ai-workflows",
      category: "ai",
      title: "Ready-Made n8n Automation Workflows & Executive Documents",
      badge: "AI Superpowers",
      badgeColor: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
      planRequirement: "Pro & Enterprise",
      summary:
        "Ask Obey on WhatsApp to design production-ready n8n JSON automation workflows, build interactive HTML tools, and generate executive Word/PDF documents.",
      steps: [
        "Generating n8n Workflows: Send Obey a voice note or message on WhatsApp like: 'Create an n8n workflow for lead intake from webhook to Supabase and send WhatsApp alert'.",
        "Obey autonomously architects a complete JSON workflow file, uploads it to your live link, and attaches the .json file directly in your WhatsApp chat!",
        "Importing to n8n: Download the attached .json file ➔ In your n8n workspace, click ⋮ (top-right) ➔ 'Import from File' (or press Ctrl + V on an empty canvas). All nodes appear fully wired and ready for API credentials.",
        "Debugging Workflows: Encountered an n8n error? Take a screenshot of your n8n canvas or node error and send it to Obey on WhatsApp. Obey's vision AI diagnoses the error and tells you the exact fix.",
        "Generating Documents: Say 'Turn this pitch into Google Docs' or 'Make this a PDF'. Obey structures publication-grade executive documents compatible with Microsoft Word and Google Docs and sends the file to WhatsApp.",
        "Creating Web Apps & Artifacts: Ask Obey to create a calculator, landing page, or dashboard. Obey returns a runnable, responsive HTML link with functional JavaScript and localStorage persistence.",
      ],
      tips: [
        "All artifacts, documents, and workflows are permanently stored under your account at femiadelekeportfolio.vercel.app/artifact/[id].",
        "Ask Obey to modify any previous artifact by saying 'Change the colors to dark mode' or 'Wire up the delete button' — Obey remembers the complete code in memory.",
      ],
    },
    {
      id: "whatsapp-delegation",
      category: "ai",
      title: "Natural WhatsApp Delegation, Stickers & Emoji Reactions",
      badge: "Human Touch",
      badgeColor: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
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
      badgeColor: "bg-slate-500/10 text-slate-300 border border-slate-700/40",
      planRequirement: "All Plans",
      summary: "Quick answers to common questions about WhatsApp connection, status views, and account setup.",
      steps: [
        "Q: Why can't a contact see my WhatsApp Status updates?\nA: WhatsApp requires reciprocal contact saving. You must save their number in your phone address book, and they must save your number. Use Obey's 'Save All Unsaved' and download the .VCF file to ensure all contacts are saved in your phone.",
        "Q: Does Obey auto-reply to my personal friends and family?\nA: For business workspaces (like AutoLearn Spot or Havilah), Obey ONLY auto-replies to incoming customer inquiries based on your catalog and keyword rules. You can also turn on human takeover anytime. For the business owner, Obey acts exclusively as their private assistant.",
        "Q: What happens if Evolution API disconnects?\nA: Obey runs a background heartbeat health checker. If a connection drops, your Control Room displays a re-connect alert, and you can re-scan your QR code in 5 seconds without losing any data or leads.",
        "Q: Can I change my voice accent and opening greeting later?\nA: Yes! Go to 'AI Brain & Settings' in the Control Room anytime to switch voices, tweak your business bio, or update catalog pricing.",
        "Q: How do I cancel or change my plan?\nA: You can manage your subscription directly in the Billing card in your Control Room. Subscriptions are billed securely in Nigerian Naira (NGN) via Paystack.",
      ],
    },
  ];

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-500/30 selection:text-purple-200">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-black text-base sm:text-lg text-white tracking-tight flex items-center gap-2 hover:opacity-80 transition"
            >
              <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-purple-600/30">
                ⚡
              </span>
              <span>Obey Knowledge Hub</span>
            </Link>
            <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
              v2.5 Production
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/control-room"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <span>Open Control Room</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-slate-800/60 bg-gradient-to-b from-purple-950/20 via-slate-950 to-slate-950 py-12 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/40 border border-purple-700/50 text-purple-300 text-xs font-semibold">
            <BookOpen className="w-3.5 h-3.5 text-purple-400" />
            <span>Complete User Manual & Feature Documentation</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Everything you can do with{" "}
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-emerald-400 bg-clip-text text-transparent">
              Obey Business AI
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            From WhatsApp QR pairing to automated contact saving, multi-bucket segmentation, scheduled status updates, voice calls, and n8n workflows — explore how to unleash Obey for your business.
          </p>

          {/* Search Box */}
          <div className="max-w-xl mx-auto pt-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search manual (e.g. buckets, status views, voice hotline, n8n, pricing)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-purple-500 shadow-xl transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
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
                  ? "bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-850"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Guides Accordion / List */}
        <div className="space-y-4">
          {filteredSections.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-3">
              <Search className="w-8 h-8 text-slate-600 mx-auto" />
              <h3 className="font-bold text-white text-base">No manual guides matched your search</h3>
              <p className="text-xs text-slate-400">
                Try searching for keywords like &ldquo;plans&rdquo;, &ldquo;contacts&rdquo;, &ldquo;status&rdquo;, &ldquo;hotline&rdquo;, or &ldquo;broadcast&rdquo;.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("all");
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
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
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition shadow-sm"
                >
                  {/* Card Header (Click to toggle) */}
                  <button
                    onClick={() => setExpandedSection(isExpanded ? null : sec.id)}
                    className="w-full p-5 sm:p-6 text-left flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-850/50 transition"
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
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {sec.planRequirement}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        {sec.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        {sec.summary}
                      </p>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-800/80 text-slate-400 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-white" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Card Body (Detailed Steps & Tips) */}
                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-slate-800/70 space-y-4 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2.5">
                          Step-by-Step Instructions & Workflow:
                        </h4>
                        <div className="space-y-2">
                          {sec.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 text-xs sm:text-sm text-slate-200 leading-relaxed"
                            >
                              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <div className="flex-1 whitespace-pre-line">{step}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {sec.tips && sec.tips.length > 0 && (
                        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30 space-y-1.5">
                          <h5 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Pro Tips & Best Practices:</span>
                          </h5>
                          <ul className="space-y-1 text-xs text-emerald-200/90 list-disc list-inside">
                            {sec.tips.map((tip, i) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="pt-2 flex items-center justify-between border-t border-slate-800/60 text-xs text-slate-400">
                        <span>Need live assistance with this step?</span>
                        <Link
                          href="/control-room"
                          className="text-emerald-400 hover:underline flex items-center gap-1 font-bold"
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
        <section className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-emerald-950/40 border border-purple-800/40 rounded-3xl p-6 sm:p-10 text-center space-y-4 shadow-2xl">
          <h2 className="text-xl sm:text-3xl font-black text-white">
            Ready to Automate Your Business?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Launch your dedicated AI business companion right now. Start with our 7-day 100% free trial on the Pro plan or configure your Starter workspace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/control-room"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-emerald-500/20"
            >
              Open Control Room
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm transition border border-slate-700"
            >
              Back to Home
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
