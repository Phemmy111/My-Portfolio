"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
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
} from "lucide-react";

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

  React.useEffect(() => {
    fetch("/api/obey/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setPlatformPricing(data.pricing);
      })
      .catch(() => {});
  }, []);

  // Onboarding Form State - Defaults to 7-Day Free Trial
  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_name: "",
    owner_phone: "",
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
        owner_phone:
          prev.owner_phone ||
          user.primaryPhoneNumber?.phoneNumber?.replace(/[^0-9]/g, "") ||
          "",
      }));
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
      const res = await fetch("/api/obey/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          owner_name: form.owner_name.trim(),
          owner_phone: form.owner_phone.trim(),
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
    <div className="min-h-screen bg-[#dfe3e8] text-zinc-900 font-sans selection:bg-emerald-500/20 selection:text-emerald-950">
      {/* Top Navigation */}
      <header className="border-b border-zinc-300/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto shadow-xs">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-600/20">
            <Bot className="w-5 h-5 text-white font-bold" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-zinc-950 flex items-center gap-1.5">
              Obey Business{" "}
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
                AI 2.0
              </span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/portfolio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 text-xs font-bold border border-zinc-300 transition shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Creator:</span>
            <span>Femi Adeleke</span>
          </Link>

          <Link
            href="/call?biz=femi-adeleke"
            target="_blank"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 text-xs font-bold border border-zinc-300 transition shadow-xs"
          >
            <PhoneCall className="w-3.5 h-3.5 text-teal-600" />
            <span>Try Voice Hotline</span>
          </Link>

          <Link
            href="/control-room"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-md shadow-emerald-600/20"
          >
            Control Room
          </Link>

          {isSignedIn ? (
            <div className="pl-1 border-l border-zinc-300 flex items-center">
              <UserButton />
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition shadow-xs"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-14 pb-20 px-4 sm:px-6 max-w-6xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-xs font-bold shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>The Next-Generation Business Automation Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-zinc-950 tracking-tight leading-tight max-w-4xl mx-auto">
          Turn Your WhatsApp & Website Into a{" "}
          <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
            24/7 AI Sales Machine
          </span>
        </h1>

        <p className="text-sm sm:text-lg text-zinc-700 max-w-2xl mx-auto leading-relaxed font-medium">
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
            className="px-5 py-3.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-sm border border-zinc-300 transition shadow-xs flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4 text-teal-600" />
            <span>Test Live Voice Call</span>
          </Link>
        </div>

        {/* Live Social Proof Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs font-semibold text-zinc-700">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Auto-Save Contacts (No Frozen Phones)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Speaks Pidgin, Yoruba & English
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Paystack Integrated
          </span>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950">
            Everything You Need to Automate Customer Acquisition
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700 max-w-xl mx-auto">
            Traditional WhatsApp bots rely on rigid keyword buttons that irritate customers. Obey combines instant keyword triggers with real AI reasoning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Branded WebRTC Voice Hotline</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Give your business a dedicated voice hotline link (<code className="bg-zinc-100 text-zinc-900 font-mono px-1 py-0.5 rounded border border-zinc-200 font-semibold">/call?biz=your-brand</code>). Customers call directly through their phone browser with zero international airtime charges. Full audio recordings and transcripts sent to you immediately.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Automatic Contact Capture & vCard Export</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Every customer who chats with you or calls your hotline is automatically saved with their interest and notes. Export directly to Excel (<code className="bg-zinc-100 text-zinc-900 font-mono px-1 py-0.5 rounded border border-zinc-200 font-semibold">.csv</code>) or download a <code className="bg-zinc-100 text-zinc-900 font-mono px-1 py-0.5 rounded border border-zinc-200 font-semibold">.vcf</code> file for 1-tap import into your phone contacts!
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Instant Keyword Responders + AI Reasoning</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Set instant replies for &quot;price&quot;, &quot;catalog&quot;, &quot;bank account&quot;, or &quot;location&quot;. When customers ask complex questions outside your keywords, Obey smoothly falls back to your custom catalog and business bio with human-grade intelligence.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Personalized WhatsApp Broadcasts</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Draft promotional announcements with dynamic tags like <code className="bg-zinc-100 text-zinc-900 font-mono px-1 py-0.5 rounded border border-zinc-200 font-semibold">&#123;name&#125;</code> and send them directly to your captured leads. Segment by New Leads or Hot Prospects to maximize conversion.
            </p>
          </div>

          {/* Card 5 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Multimodal Receipt & Photo Verification</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Customers can snap pictures of products or send bank transfer receipts. Obey reads images using multimodal vision, confirms payments, and answers visual inquiries instantly.
            </p>
          </div>

          {/* Card 6 */}
          <div className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-2xl p-6 space-y-3 relative overflow-hidden shadow-sm hover:shadow-md transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-zinc-950 text-base">Private Business Control Room</h3>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              Manage your entire operation from your private web dashboard. Update pricing, view call logs with audio player, customize voice greetings, and track your metrics in real-time.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Capabilities Matrix */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950">
            Enterprise Automation Architecture & Capabilities
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700">
            A breakdown of how Obey combines instant keyword triggers with contextual LLM reasoning.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-300 bg-white shadow-md">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-100 text-zinc-900 border-b border-zinc-300">
              <tr>
                <th className="p-4 font-bold">Feature</th>
                <th className="p-4 font-bold text-zinc-600">Traditional Auto-Responders</th>
                <th className="p-4 font-extrabold text-emerald-700 bg-emerald-50/70">Obey Autonomous Platform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              <tr>
                <td className="p-4 font-semibold text-zinc-900">AI Intelligence & Reasoning</td>
                <td className="p-4 text-zinc-600 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  Rigid regex keywords only
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Deep contextual LLM reasoning + Smart Keyword Triggers
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900">WebRTC Voice Hotline Calling</td>
                <td className="p-4 text-zinc-600 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  None (Text only)
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  100% Free WebRTC Voice Hotline with audio recordings
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900">Nigerian Dialects & Accents</td>
                <td className="p-4 text-zinc-600 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  Robotic flat English
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Natural Nigerian Pidgin, Yoruba, & fluent English
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900">Contact Auto-Save & vCard</td>
                <td className="p-4 text-zinc-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Google Contacts sync
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Live Leads CRM + 1-Click Excel CSV & Phone vCard (.vcf)
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900">Document & Proposal Creation</td>
                <td className="p-4 text-zinc-600 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  None
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Generates Word (.doc), Markdown & Web Artifacts
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-zinc-900">Personalized Broadcasts</td>
                <td className="p-4 text-zinc-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Static text broadcasts
                </td>
                <td className="p-4 text-emerald-800 font-semibold bg-emerald-50/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700">
            Cancel or change plans anytime via Paystack. Every account starts with a {platformPricing.trial_days}-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* Starter */}
          <div className="bg-white border border-zinc-300 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-md transition">
            <div className="space-y-3">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Starter</div>
              <div className="text-3xl font-black text-zinc-950">
                ₦{platformPricing.starter_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-500 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-700">
                Ideal for solo founders and boutique businesses starting with automated customer replies.
              </p>
              <ul className="text-xs text-zinc-800 space-y-2 pt-2 border-t border-zinc-200 font-medium">
                <li className="flex items-center gap-2">✓ Up to 250 auto-saved contacts</li>
                <li className="flex items-center gap-2">✓ 10 Keyword Auto-responders</li>
                <li className="flex items-center gap-2">✓ 15 hours/mo WebRTC Voice Hotline</li>
                <li className="flex items-center gap-2">✓ CSV & Phone vCard Export</li>
              </ul>
            </div>
            <a
              href="#onboard"
              onClick={() => setForm({ ...form, plan: "starter" })}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold text-center block transition shadow-xs"
            >
              Choose Starter
            </a>
          </div>

          {/* Pro */}
          <div className="bg-emerald-50/50 border-2 border-emerald-600 rounded-2xl p-6 space-y-4 relative flex flex-col justify-between shadow-xl shadow-emerald-600/10">
            <span className="absolute -top-3 right-6 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider shadow-sm">
              Most Popular
            </span>
            <div className="space-y-3">
              <div className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">Pro Business</div>
              <div className="text-3xl font-black text-zinc-950">
                ₦{platformPricing.pro_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-600 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-800">
                For established businesses that want full WhatsApp automation, unlimited contacts, and voice calling.
              </p>
              <ul className="text-xs text-zinc-900 space-y-2 pt-2 border-t border-emerald-200 font-medium">
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> auto-saved customer leads</li>
                <li className="flex items-center gap-2">✓ 50 Keyword Auto-responders</li>
                <li className="flex items-center gap-2">✓ 50 hours/mo WebRTC Voice Hotline</li>
                <li className="flex items-center gap-2">✓ Audio recordings & transcripts on WhatsApp</li>
                <li className="flex items-center gap-2">✓ Custom Business Catalog & Bank Details</li>
                <li className="flex items-center gap-2">✓ Personalized WhatsApp Broadcasts</li>
              </ul>
            </div>
            <a
              href="#onboard"
              onClick={() => setForm({ ...form, plan: "trial" })}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black text-center block transition shadow-lg shadow-emerald-600/25"
            >
              Start {platformPricing.trial_days}-Day Free Trial (Pro)
            </a>
          </div>

          {/* Enterprise */}
          <div className="bg-white border border-zinc-300 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-md transition">
            <div className="space-y-3">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Enterprise / Founder</div>
              <div className="text-3xl font-black text-zinc-950">
                ₦{platformPricing.enterprise_price.toLocaleString()}{" "}
                <span className="text-xs text-zinc-500 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-700">
                High-volume organizations, schools, or agencies needing unlimited minutes and multi-agent systems.
              </p>
              <ul className="text-xs text-zinc-800 space-y-2 pt-2 border-t border-zinc-200 font-medium">
                <li className="flex items-center gap-2">✓ Full Multi-tenant WhatsApp Bot</li>
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> Voice Hotline minutes</li>
                <li className="flex items-center gap-2">✓ Autonomous Web App & Document Generator</li>
                <li className="flex items-center gap-2">✓ Priority 24/7 dedicated support</li>
              </ul>
            </div>
            <a
              href="#onboard"
              onClick={() => setForm({ ...form, plan: "enterprise" })}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold text-center block transition shadow-xs"
            >
              Choose Enterprise
            </a>
          </div>
        </div>
      </section>

      {/* 60-Second Onboarding Form */}
      <section id="onboard" className="max-w-xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Instant Setup in 60 Seconds</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950">
            Register Your Business Workspace
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700">
            Create your account now and immediately customize your AI brain, test your hotline, and connect WhatsApp.
          </p>
        </div>

        <div className="bg-white border border-zinc-300 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-zinc-800 block mb-1">Business Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Havilah Touch Farms"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
              />
            </div>

            <div>
              <label className="font-bold text-zinc-800 block mb-1">
                Unique Business Handle (URL Slug) *
              </label>
              <div className="flex items-center bg-zinc-50 border border-zinc-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 shadow-xs">
                <span className="px-3 text-zinc-500 text-xs font-mono">.../call?biz=</span>
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
                  className="w-full bg-transparent p-3 text-zinc-900 font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-zinc-800 block mb-1">Owner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fadesewa Adeleke"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-800 block mb-1">
                  Owner WhatsApp Phone *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="2348012345678"
                  value={form.owner_phone}
                  onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
                  className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-zinc-900 font-mono placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-zinc-800 block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="owner@yourbrand.com"
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
              />
            </div>

            <div>
              <label className="font-bold text-zinc-800 block mb-1">Selected Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full bg-white border border-zinc-300 rounded-xl p-3 text-zinc-900 font-semibold outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs cursor-pointer"
              >
                <option value="trial" className="bg-white text-zinc-900 font-bold py-1.5">
                  🎉 {platformPricing.trial_days}-Day Full Free Trial (All Pro Features — ₦0 Today)
                </option>
                <option value="pro" className="bg-white text-zinc-900 py-1.5">
                  Pro Business Plan (₦{platformPricing.pro_price.toLocaleString()}/month) — Recommended
                </option>
                <option value="starter" className="bg-white text-zinc-900 py-1.5">
                  Starter Plan (₦{platformPricing.starter_price.toLocaleString()}/month)
                </option>
                <option value="enterprise" className="bg-white text-zinc-900 py-1.5">
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

            <p className="text-[11px] text-zinc-600 text-center pt-2 font-medium">
              🔒 {platformPricing.trial_days}-day free trial included. No credit card required to begin setup.
            </p>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-300/80 py-8 px-6 text-center text-xs text-zinc-600 space-y-2 bg-white/40">
        <p>
          Built by{" "}
          <Link href="/portfolio" className="text-emerald-700 hover:underline font-bold">
            Femi Adeleke
          </Link>{" "}
          • Elite Full-Stack AI Automation Engineer
        </p>
        <p>© {new Date().getFullYear()} Obey Business. All rights reserved.</p>
      </footer>
    </div>
  );
}
