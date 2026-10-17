"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Bot,
  Zap,
  PhoneCall,
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  Download,
  Send,
  MessageSquare,
  Building2,
  Check,
  HelpCircle,
  ChevronRight,
  Star,
  ExternalLink,
  BookOpen,
} from "lucide-react";

const COUNTRY_CODES = [
  { code: "234", flag: "🇳🇬", label: "NIG (+234)" },
  { code: "233", flag: "🇬🇭", label: "GHA (+233)" },
  { code: "254", flag: "🇰🇪", label: "KEN (+254)" },
  { code: "27", flag: "🇿🇦", label: "ZAF (+27)" },
  { code: "44", flag: "🇬🇧", label: "GBR (+44)" },
  { code: "1", flag: "🇺🇸", label: "USA (+1)" },
  { code: "1", flag: "🇨🇦", label: "CAN (+1)" },
  { code: "971", flag: "🇦🇪", label: "ARE (+971)" },
];

export default function Home() {
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn, user } = useUser();

  // Dynamic Platform Pricing & Trial
  const [platformPricing, setPlatformPricing] = useState({
    starter_price: 9500,
    pro_price: 22500,
    enterprise_price: 55000,
    trial_days: 7,
  });

  const [selectedPlanModal, setSelectedPlanModal] = useState<"starter" | "pro" | "enterprise" | null>(null);

  React.useEffect(() => {
    fetch("/api/obey/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setPlatformPricing(data.pricing);
      })
      .catch(() => {});
  }, []);

  const planDetails = {
    starter: {
      name: "Starter Plan",
      badge: "Emerging Businesses",
      badgeColor: "bg-zinc-100 text-zinc-800 border-zinc-300",
      price: platformPricing.starter_price,
      trial: false,
      summary: "Ideal for solo founders, boutique businesses, and freelance consultants starting with automated customer replies.",
      features: [
        { title: "1 Single Business Workspace", desc: "Dedicated instance connecting your brand's unique phone number." },
        { title: "Up to 250 Auto-Saved Contacts", desc: "Captures and indexes leads so they can view your WhatsApp Status stories." },
        { title: "2 Contact Buckets", desc: "Group your leads into up to 2 distinct bucket lists for targeted broadcasts." },
        { title: "10 Keyword Auto-Responders", desc: "Instant replies for frequently asked questions, prices, and locations." },
        { title: "15 Hours/Month WebRTC Voice Hotline", desc: "Zero-airtime audio calls with your chosen AI voice profile." },
        { title: "Phone vCard (.vcf) & Excel CSV Export", desc: "1-tap contact export directly into your phone address book." },
      ],
      planKey: "starter",
    },
    pro: {
      name: "Pro Business Plan",
      badge: "Most Popular — 7-Day Free Trial",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
      price: platformPricing.pro_price,
      trial: true,
      summary: "Built for active businesses seeking aggressive customer growth, unlimited lead storage, voice transcripts, and broadcasts.",
      features: [
        { title: "7-Day 100% Free Trial", desc: "Full Pro features with ₦0 charged today. Test everything risk-free." },
        { title: "UNLIMITED Auto-Saved Contacts", desc: "Never hit a ceiling — every incoming customer is permanently indexed." },
        { title: "Up to 10 Contact Buckets", desc: "Segment your audience into VIP, Wholesale, Retail, and Follow-Up buckets." },
        { title: "50 Keyword Auto-Responders", desc: "Comprehensive coverage of your product lines, services, and queries." },
        { title: "50 Hours/Month WebRTC Voice Hotline", desc: "Ample voice calling time for inbound sales and customer inquiries." },
        { title: "Audio Recordings & Full WhatsApp Transcripts", desc: "Delivered straight to your WhatsApp as soon as each call ends." },
        { title: "Custom Business Catalog & Bank Details", desc: "Obey pitches your real services and takes orders with your account number." },
        { title: "Personalized WhatsApp Broadcasts", desc: "Send dynamic broadcast messages with {name} & {business} merge tags." },
      ],
      planKey: "trial",
    },
    enterprise: {
      name: "Enterprise / Founder Plan",
      badge: "Multi-Brand Scaling",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-300",
      price: platformPricing.enterprise_price,
      trial: false,
      summary: "High-volume operations, multi-brand entrepreneurs, agencies, and schools needing unlimited minutes and multi-agent systems.",
      features: [
        { title: "Multi-Business Management", desc: "Register and run up to 2 distinct brand workspaces under one account." },
        { title: "Full Multi-Tenant WhatsApp Bot", desc: "Independent AI brains, bios, and catalogs for each business." },
        { title: "UNLIMITED Contact Buckets", desc: "Create as many audience buckets as your campaigns require." },
        { title: "UNLIMITED Voice Hotline Minutes", desc: "Zero restrictions on WebRTC call volume or customer duration." },
        { title: "Autonomous n8n Workflows & Web App Generator", desc: "Ask Obey on WhatsApp to architect production-ready JSON and HTML tools." },
        { title: "24/7 Dedicated Priority Support", desc: "Direct engineering support from Femi Adeleke and the core tech team." },
      ],
      planKey: "enterprise",
    },
  };

  // Country Code & Local Phone
  const [countryCode, setCountryCode] = useState("234");
  const [localPhone, setLocalPhone] = useState("");

  // Onboarding Form State - Defaults to 7-Day Free Trial
  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_name: "",
    owner_email: "",
    category: "Retail & E-commerce",
    plan: "trial",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Pre-fill user details if logged in via Clerk
  React.useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        owner_name: prev.owner_name || user.fullName || user.firstName || "",
        owner_email: prev.owner_email || user.primaryEmailAddress?.emailAddress || "",
      }));
      if (user.primaryPhoneNumber?.phoneNumber) {
        setLocalPhone(user.primaryPhoneNumber.phoneNumber.replace(/[^0-9]/g, "").slice(-10));
      }
    }
  }, [user]);

  const handleNameChange = (val: string) => {
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
    setForm({ ...form, name: val, slug });
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    try {
      const cleanNumber = localPhone.replace(/^0+/, "").replace(/[^0-9]/g, "");
      if (!cleanNumber || cleanNumber.length < 7) {
        throw new Error("Please enter a valid WhatsApp local number (e.g. 9074027451)");
      }
      const fullPhone = `${countryCode}${cleanNumber}`;

      const res = await fetch("/api/obey/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          owner_name: form.owner_name.trim(),
          owner_phone: fullPhone,
          owner_email: form.owner_email.trim() || undefined,
          owner_clerk_id: user?.id || undefined,
          plan: form.plan,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize workspace");
      }

      // If user is already authenticated with Clerk, go straight to control room
      if (isSignedIn) {
        router.push(`/control-room?biz=${encodeURIComponent(data.workspace.slug)}`);
      } else {
        // If not authenticated, route securely through sign-up with instant redirect back to control room
        const redirectDestination = `/control-room?biz=${encodeURIComponent(data.workspace.slug)}`;
        router.push(`/sign-up?redirect_url=${encodeURIComponent(redirectDestination)}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-[#050b14] text-zinc-900 dark:text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-950 transition-colors duration-200">
      {/* Top Navigation */}
      <header className="border-b border-zinc-300/80 dark:border-slate-800 bg-white/90 dark:bg-[#060d1a]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto shadow-xs">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-emerald-600/20 border border-emerald-500/20 shrink-0">
            <Image
              src="/obey-logo.jpg"
              alt="Obey Logo"
              width={36}
              height={36}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-zinc-950 dark:text-white flex items-center gap-1.5">
              Obey Business{" "}
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-full">
                AI 2.0
              </span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            href="/portfolio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#0b1424] hover:bg-zinc-100 dark:hover:bg-slate-800 text-zinc-800 dark:text-slate-200 text-xs font-bold border border-zinc-300 dark:border-slate-800 transition shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Creator:</span>
            <span>Femi Adeleke</span>
          </Link>

          <Link
            href="/call?biz=femi-adeleke"
            target="_blank"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#0b1424] hover:bg-zinc-100 dark:hover:bg-slate-800 text-zinc-800 dark:text-slate-200 text-xs font-bold border border-zinc-300 dark:border-slate-800 transition shadow-xs"
          >
            <PhoneCall className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Try Voice Hotline</span>
          </Link>

          <Link
            href="/manual"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#0b1424] hover:bg-zinc-100 dark:hover:bg-slate-800 text-zinc-800 dark:text-slate-200 text-xs font-bold border border-zinc-300 dark:border-slate-800 transition shadow-xs"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">User</span>
            <span>Manual</span>
          </Link>

          <Link
            href="/control-room"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-md shadow-emerald-600/20"
          >
            Control Room
          </Link>

          <ThemeToggle showLabel={false} />

          {isSignedIn ? (
            <div className="pl-1 border-l border-zinc-300 dark:border-slate-800 flex items-center">
              <UserButton />
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-slate-800 hover:bg-zinc-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition shadow-xs"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-14 pb-20 px-4 sm:px-6 max-w-6xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 text-xs font-bold shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span>The Next-Generation Business Automation Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-zinc-950 dark:text-white tracking-tight leading-tight max-w-4xl mx-auto">
          Turn Your WhatsApp & Website Into a{" "}
          <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
            24/7 AI Sales Machine
          </span>
        </h1>

        <p className="text-sm sm:text-lg text-zinc-700 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
          Never lose a customer while you sleep. Auto-save all WhatsApp contacts, reply instantly to price inquiries, dispatch personalized broadcasts, and give your customers a 100% free WebRTC voice hotline.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <a
            href="#onboard"
            className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-600/25 flex items-center gap-2"
          >
            <span>Start {platformPricing.trial_days}-Day Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </a>

          <Link
            href="/call?biz=femi-adeleke"
            target="_blank"
            className="px-5 py-3.5 rounded-xl bg-white dark:bg-[#0b1424] hover:bg-zinc-100 dark:hover:bg-slate-800 text-zinc-900 dark:text-slate-200 font-bold text-sm border border-zinc-300 dark:border-slate-800 transition shadow-xs flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Test Live Voice Call</span>
          </Link>
        </div>

        {/* Live Social Proof Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs font-semibold text-zinc-700 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Auto-Save Contacts (No Frozen Phones)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Speaks Pidgin, Yoruba & English
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Paystack Integrated
          </span>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white">
            Everything You Need to Automate Customer Acquisition
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700 dark:text-slate-400 max-w-xl mx-auto">
            Traditional WhatsApp bots rely on rigid keyword buttons that irritate customers. Obey combines instant keyword triggers with real AI reasoning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Branded WebRTC Voice Hotline</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Give your business a dedicated voice hotline link (<code className="bg-zinc-100 dark:bg-slate-900 text-zinc-900 dark:text-slate-200 font-mono px-1 py-0.5 rounded border border-zinc-200 dark:border-slate-800 font-semibold">/call?biz=your-brand</code>). Customers call directly through their phone browser with zero international airtime charges. Full audio recordings and transcripts sent to you immediately.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Automatic Contact Capture & vCard Export</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Every customer who chats with you or calls your hotline is automatically saved with their interest and notes. Export directly to Excel (<code className="bg-zinc-100 dark:bg-slate-900 text-zinc-900 dark:text-slate-200 font-mono px-1 py-0.5 rounded border border-zinc-200 dark:border-slate-800 font-semibold">.csv</code>) or download a <code className="bg-zinc-100 dark:bg-slate-900 text-zinc-900 dark:text-slate-200 font-mono px-1 py-0.5 rounded border border-zinc-200 dark:border-slate-800 font-semibold">.vcf</code> file for 1-tap import into your phone contacts!
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Instant Keyword Responders + AI Reasoning</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Set instant replies for &quot;price&quot;, &quot;catalog&quot;, &quot;bank account&quot;, or &quot;location&quot;. When customers ask complex questions outside your keywords, Obey smoothly falls back to your custom catalog and business bio with human-grade intelligence.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Personalized WhatsApp Broadcasts</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Draft promotional announcements with dynamic tags like <code className="bg-zinc-100 dark:bg-slate-900 text-zinc-900 dark:text-slate-200 font-mono px-1 py-0.5 rounded border border-zinc-200 dark:border-slate-800 font-semibold">&#123;name&#125;</code> and send them directly to your captured leads. Segment by New Leads or Hot Prospects to maximize conversion.
            </p>
          </div>

          {/* Card 5 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-700 dark:text-rose-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Multimodal Receipt & Photo Verification</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Customers can snap pictures of products or send bank transfer receipts. Obey reads images using multimodal vision, confirms payments, and answers visual inquiries instantly.
            </p>
          </div>

          {/* Card 6 */}
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-400 dark:hover:border-slate-700 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 dark:text-white text-base">Private Business Control Room</h3>
            <p className="text-xs text-zinc-700 dark:text-slate-400 leading-relaxed font-normal">
              Manage your entire operation from your private web dashboard. Update pricing, view call logs with audio player, customize voice greetings, and track your metrics in real-time.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Capabilities Matrix */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white">
            Enterprise Automation Architecture & Capabilities
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700 dark:text-slate-400">
            A breakdown of how Obey combines instant keyword triggers with contextual LLM reasoning.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-300 dark:border-slate-800 bg-white dark:bg-[#0b1424] shadow-md">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-100 dark:bg-slate-900 text-zinc-900 dark:text-slate-200 border-b border-zinc-300 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold">Feature</th>
                <th className="p-4 font-bold text-zinc-600 dark:text-slate-400">Traditional Auto-Responders</th>
                <th className="p-4 font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40">Obey Autonomous Platform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-slate-800">
              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">AI Intelligence & Reasoning</td>
                <td className="p-4 text-zinc-600 dark:text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  Rigid regex keywords only
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Deep contextual LLM reasoning + Smart Keyword Triggers
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">WebRTC Voice Hotline Calling</td>
                <td className="p-4 text-zinc-600 dark:text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  None (Text only)
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  100% Free WebRTC Voice Hotline with audio recordings
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">Nigerian Dialects & Accents</td>
                <td className="p-4 text-zinc-600 dark:text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  Robotic flat English
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Natural Nigerian Pidgin, Yoruba, & fluent English
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">Contact Auto-Save & vCard</td>
                <td className="p-4 text-zinc-700 dark:text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Google Contacts sync
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Live Leads CRM + 1-Click Excel CSV & Phone vCard (.vcf)
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">Document & Proposal Creation</td>
                <td className="p-4 text-zinc-600 dark:text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  None
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Generates Word (.doc), Markdown & Web Artifacts
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900 dark:text-slate-200">Personalized Broadcasts</td>
                <td className="p-4 text-zinc-700 dark:text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Static text broadcasts
                </td>
                <td className="p-4 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  Personalized dynamic tags (&#123;name&#125;, &#123;business&#125;)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Interactive Plan Breakdown & Limits</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700 dark:text-slate-400">
            Cancel or change plans anytime via Paystack. Every account starts with a {platformPricing.trial_days}-day free trial.
          </p>
          <div className="pt-1">
            <Link
              href="/manual#plans"
              className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Read Full Plan Comparison & Quotas in User Manual &rarr;</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* Starter */}
          <div
            onClick={() => setSelectedPlanModal("starter")}
            className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-zinc-500 dark:hover:border-slate-700 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-xl transition cursor-pointer group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">Starter</span>
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60 transition">
                  Click for Details ➔
                </span>
              </div>
              <div className="text-3xl font-black text-zinc-950 dark:text-white">
                ₦{platformPricing.starter_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-500 dark:text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-700 dark:text-slate-400">
                Ideal for solo founders and boutique businesses starting with automated customer replies.
              </p>
              <ul className="text-xs text-zinc-800 dark:text-slate-300 space-y-2 pt-2 border-t border-zinc-200 dark:border-slate-800 font-medium">
                <li className="flex items-center gap-2">✓ 1 Single Business Workspace</li>
                <li className="flex items-center gap-2">✓ Up to 250 auto-saved contacts</li>
                <li className="flex items-center gap-2">✓ 2 Contact Buckets</li>
                <li className="flex items-center gap-2">✓ 10 Keyword Auto-responders</li>
                <li className="flex items-center gap-2">✓ 15 hours/mo WebRTC Voice Hotline</li>
                <li className="flex items-center gap-2">✓ CSV & Phone vCard Export</li>
              </ul>
            </div>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlanModal("starter");
                }}
                className="w-full py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold text-center block transition cursor-pointer"
              >
                🔍 View Detailed Breakdown
              </button>
              <a
                href="#onboard"
                onClick={(e) => {
                  e.stopPropagation();
                  setForm({ ...form, plan: "starter" });
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-slate-800 hover:bg-zinc-800 dark:hover:bg-slate-700 text-white text-xs font-bold text-center block transition shadow-xs"
              >
                Choose Starter
              </a>
            </div>
          </div>

          {/* Pro */}
          <div
            onClick={() => setSelectedPlanModal("pro")}
            className="bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-emerald-600 hover:border-emerald-700 rounded-2xl p-6 space-y-4 relative flex flex-col justify-between shadow-xl shadow-emerald-600/10 cursor-pointer group"
          >
            <span className="absolute -top-3 right-6 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider shadow-sm">
              Most Popular
            </span>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">Pro Business</span>
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded-full group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition">
                  Click for Details ➔
                </span>
              </div>
              <div className="text-3xl font-black text-zinc-950 dark:text-white">
                ₦{platformPricing.pro_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-600 dark:text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-800 dark:text-slate-300">
                For established businesses that want full WhatsApp automation, unlimited contacts, and voice calling.
              </p>
              <ul className="text-xs text-zinc-900 dark:text-slate-200 space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 font-medium">
                <li className="flex items-center gap-2">✓ 1 Dedicated Business Workspace</li>
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> auto-saved customer leads</li>
                <li className="flex items-center gap-2">✓ Up to 10 Contact Buckets</li>
                <li className="flex items-center gap-2">✓ 50 Keyword Auto-responders</li>
                <li className="flex items-center gap-2">✓ 50 hours/mo WebRTC Voice Hotline</li>
                <li className="flex items-center gap-2">✓ Audio recordings & transcripts on WhatsApp</li>
                <li className="flex items-center gap-2">✓ Custom Business Catalog & Bank Details</li>
                <li className="flex items-center gap-2">✓ Personalized WhatsApp Broadcasts</li>
              </ul>
            </div>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlanModal("pro");
                }}
                className="w-full py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold text-center block transition cursor-pointer"
              >
                🔍 View Detailed Breakdown
              </button>
              <a
                href="#onboard"
                onClick={(e) => {
                  e.stopPropagation();
                  setForm({ ...form, plan: "trial" });
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black text-center block transition shadow-lg shadow-emerald-600/25"
              >
                Start {platformPricing.trial_days}-Day Free Trial (Pro)
              </a>
            </div>
          </div>

          {/* Enterprise */}
          <div
            onClick={() => setSelectedPlanModal("enterprise")}
            className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-xl transition cursor-pointer group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-slate-400 uppercase tracking-wider">Enterprise / Founder</span>
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60 transition">
                  Click for Details ➔
                </span>
              </div>
              <div className="text-3xl font-black text-zinc-950 dark:text-white">
                ₦{platformPricing.enterprise_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-500 dark:text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-700 dark:text-slate-400">
                High-volume organizations, schools, or agencies needing unlimited minutes and multi-agent systems.
              </p>
              <ul className="text-xs text-zinc-800 dark:text-slate-300 space-y-2 pt-2 border-t border-zinc-200 dark:border-slate-800 font-medium">
                <li className="flex items-center gap-2">✓ <strong>Multi-Business:</strong> Add & manage up to 2 distinct brand workspaces</li>
                <li className="flex items-center gap-2">✓ Full Multi-tenant WhatsApp Bot</li>
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> Contact Buckets</li>
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> Voice Hotline minutes</li>
                <li className="flex items-center gap-2">✓ Autonomous Web App & Document Generator</li>
                <li className="flex items-center gap-2">✓ Priority 24/7 dedicated support</li>
              </ul>
            </div>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlanModal("enterprise");
                }}
                className="w-full py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold text-center block transition cursor-pointer"
              >
                🔍 View Detailed Breakdown
              </button>
              <a
                href="#onboard"
                onClick={(e) => {
                  e.stopPropagation();
                  setForm({ ...form, plan: "enterprise" });
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-slate-800 hover:bg-zinc-800 dark:hover:bg-slate-700 text-white text-xs font-bold text-center block transition shadow-xs"
              >
                Choose Enterprise
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 60-Second Onboarding Form */}
      <section id="onboard" className="max-w-xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Instant Setup in 60 Seconds</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white">
            Register Your Business Workspace
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700 dark:text-slate-400">
            Create your account now and immediately customize your AI brain, test your hotline, and connect WhatsApp.
          </p>
        </div>

        <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">Business Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Havilah Touch Farms"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
              />
            </div>

            <div>
              <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">
                Unique Business Handle (URL Slug) *
              </label>
              <div className="flex items-center bg-zinc-50 dark:bg-slate-900/80 border border-zinc-300 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 shadow-xs">
                <span className="px-3 text-zinc-500 dark:text-slate-400 text-xs font-mono">.../call?biz=</span>
                <input
                  type="text"
                  required
                  placeholder="havilah-touch"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                    })
                  }
                  className="w-full bg-transparent p-3 text-zinc-900 dark:text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">Owner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fadesewa Adeleke"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">
                  Owner WhatsApp Phone *
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs cursor-pointer shrink-0"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.label} value={c.code} className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white font-bold">
                        {c.flag} {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    placeholder="9074027451"
                    value={localPhone}
                    onChange={(e) =>
                      setLocalPhone(e.target.value.replace(/^0+/, "").replace(/[^0-9]/g, ""))
                    }
                    className="w-full bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white font-mono text-xs placeholder:text-zinc-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-slate-400 mt-1 font-mono">
                  WhatsApp format: +{countryCode}{localPhone || "9074027451"}
                </p>
                <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-300 text-xs flex items-start gap-2">
                  <span className="shrink-0 text-sm">💡</span>
                  <span><strong>Owner Tip:</strong> We recommend using a dedicated business SIM or WhatsApp Business line for Obey so you can message and test the AI directly from your personal phone.</span>
                </div>
              </div>
            </div>

            <div>
              <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="owner@yourbrand.com"
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
              />
            </div>

            <div>
              <label className="font-bold text-zinc-800 dark:text-slate-300 block mb-1">Selected Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-3 text-zinc-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs cursor-pointer"
              >
                <option value="trial" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white font-bold py-1.5">
                  🎉 {platformPricing.trial_days}-Day Full Free Trial (All Pro Features — ₦0 Today)
                </option>
                <option value="pro" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white py-1.5">
                  Pro Business Plan (₦{platformPricing.pro_price.toLocaleString()}/month) — Recommended
                </option>
                <option value="starter" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white py-1.5">
                  Starter Plan (₦{platformPricing.starter_price.toLocaleString()}/month)
                </option>
                <option value="enterprise" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white py-1.5">
                  Enterprise / Founder Plan (₦{platformPricing.enterprise_price.toLocaleString()}/month)
                </option>
              </select>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-600/25 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <span>Launching Your Control Room...</span>
                ) : (
                  <>
                    <span>Create Business Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-slate-400 text-center pt-2 font-medium">
              🔒 {platformPricing.trial_days}-day free trial included. No credit card required to begin setup.
            </p>
          </form>
        </div>
      </section>

      {/* Interactive Plan Breakdown Modal */}
      {selectedPlanModal && planDetails[selectedPlanModal] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedPlanModal(null)}
        >
          <div
            className="bg-white dark:bg-[#0b1424] rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200 relative text-zinc-950 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPlanModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 dark:bg-slate-800 hover:bg-zinc-200 dark:hover:bg-slate-700 text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-2">
              <span className={`text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border inline-block ${planDetails[selectedPlanModal].badgeColor}`}>
                {planDetails[selectedPlanModal].badge}
              </span>
              <h3 className="text-2xl font-black text-zinc-950 dark:text-white">
                {planDetails[selectedPlanModal].name}
              </h3>
              <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
                ₦{planDetails[selectedPlanModal].price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-500 dark:text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-slate-400 leading-relaxed pt-1">
                {planDetails[selectedPlanModal].summary}
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-slate-800">
              <h4 className="text-xs font-black uppercase text-zinc-700 dark:text-slate-300 tracking-wider">
                Full Plan Capabilities & Quotas:
              </h4>
              <div className="space-y-2.5">
                {planDetails[selectedPlanModal].features.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-slate-900/60 border border-zinc-100 dark:border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">{feat.title}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-slate-400 leading-normal">{feat.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <a
                href="#onboard"
                onClick={() => {
                  setForm({ ...form, plan: planDetails[selectedPlanModal].planKey });
                  setSelectedPlanModal(null);
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs text-center transition shadow-lg shadow-emerald-600/20"
              >
                {planDetails[selectedPlanModal].trial
                  ? `Claim ${platformPricing.trial_days}-Day Free Trial`
                  : `Select ${planDetails[selectedPlanModal].name}`}
              </a>
              <Link
                href="/manual#plans"
                onClick={() => setSelectedPlanModal(null)}
                className="py-3 px-4 rounded-xl bg-zinc-100 dark:bg-slate-800 hover:bg-zinc-200 dark:hover:bg-slate-700 text-zinc-800 dark:text-slate-200 font-bold text-xs text-center transition flex items-center justify-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Read in Manual</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-300/80 dark:border-slate-800 py-8 px-6 text-center text-xs text-zinc-600 dark:text-slate-400 space-y-2 bg-white/40 dark:bg-[#060d1a]/50">
        <p>
          Built by{" "}
          <Link href="/portfolio" className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold">
            Femi Adeleke
          </Link>{" "}
          • Elite Full-Stack AI Automation Engineer
        </p>
        <p>© {new Date().getFullYear()} Obey Business. All rights reserved.</p>
      </footer>
    </div>
  );
}
