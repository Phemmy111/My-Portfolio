"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  // Onboarding Form State
  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    category: "Retail & E-commerce",
    plan: "pro",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
          plan: form.plan,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize workspace");
      }

      // Redirect directly to their private control room
      router.push(`/control-room?biz=${encodeURIComponent(data.workspace.slug)}`);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Bot className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              Obey Business <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">AI 2.0</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/portfolio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Creator:</span>
            <span>Femi Adeleke</span>
          </Link>

          <Link
            href="/call?biz=femi-adeleke"
            target="_blank"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition"
          >
            <PhoneCall className="w-3.5 h-3.5 text-teal-400" />
            <span>Try Voice Hotline</span>
          </Link>

          <Link
            href="/control-room"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-md shadow-emerald-500/10"
          >
            Control Room
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 px-4 sm:px-6 max-w-6xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>The Next-Generation Business Automation Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
          Turn Your WhatsApp & Website Into a{" "}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
            24/7 AI Sales Machine
          </span>
        </h1>

        <p className="text-sm sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Never lose a customer while you sleep. Auto-save all WhatsApp contacts, reply instantly to price inquiries, dispatch personalized broadcasts, and give your customers a 100% free WebRTC voice hotline.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <a
            href="#onboard"
            className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition shadow-xl shadow-emerald-500/25 flex items-center gap-2"
          >
            <span>Start 7-Day Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </a>

          <Link
            href="/call?biz=femi-adeleke"
            target="_blank"
            className="px-5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 font-bold text-sm border border-slate-800 transition flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4 text-teal-400" />
            <span>Test Live Voice Call</span>
          </Link>
        </div>

        {/* Live Social Proof Badge */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Auto-Save Contacts (No Frozen Phones)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Speaks Pidgin, Yoruba & English
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Paystack Integrated
          </span>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Everything You Need to Automate Customer Acquisition
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Traditional WhatsApp bots rely on rigid keyword buttons that irritate customers. Obey combines instant keyword triggers with real AI reasoning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Branded WebRTC Voice Hotline</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Give your business a dedicated voice hotline link (<code className="text-emerald-400">/call?biz=your-brand</code>). Customers call directly through their phone browser with zero international airtime charges. Full audio recordings and transcripts sent to you immediately.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Automatic Contact Capture & vCard Export</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every customer who chats with you or calls your hotline is automatically saved with their interest and notes. Export directly to Excel (<code className="text-teal-400">.csv</code>) or download a <code className="text-teal-400">.vcf</code> file for 1-tap import into your phone contacts!
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Instant Keyword Responders + AI Reasoning</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Set instant replies for &quot;price&quot;, &quot;catalog&quot;, &quot;bank account&quot;, or &quot;location&quot;. When customers ask complex questions outside your keywords, Obey smoothly falls back to your custom catalog and business bio with human-grade intelligence.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Personalized WhatsApp Broadcasts</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Draft promotional announcements with dynamic tags like <code className="text-indigo-400">&#123;name&#125;</code> and send them directly to your captured leads. Segment by New Leads or Hot Prospects to maximize conversion.
            </p>
          </div>

          {/* Card 5 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Multimodal Receipt & Photo Verification</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customers can snap pictures of products or send bank transfer receipts. Obey reads images using multimodal vision, confirms payments, and answers visual inquiries instantly.
            </p>
          </div>

          {/* Card 6 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Private Business Control Room</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Manage your entire operation from your private web dashboard. Update pricing, view call logs with audio player, customize voice greetings, and track your metrics in real-time.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Capabilities Matrix */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Enterprise Automation Architecture & Capabilities
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            A breakdown of how Obey combines instant keyword triggers with contextual LLM reasoning.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-850 text-slate-300 border-b border-slate-800">
              <tr>
                <th className="p-4 font-bold">Feature</th>
                <th className="p-4 font-bold text-slate-400">Traditional Auto-Responders</th>
                <th className="p-4 font-extrabold text-emerald-400">Obey Autonomous Platform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="p-4 font-semibold text-slate-200">AI Intelligence & Reasoning</td>
                <td className="p-4 text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  Rigid regex keywords only
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Deep contextual LLM reasoning + Smart Keyword Triggers
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-slate-200">WebRTC Voice Hotline Calling</td>
                <td className="p-4 text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  None (Text only)
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  100% Free WebRTC Voice Hotline with audio recordings
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-slate-200">Nigerian Dialects & Accents</td>
                <td className="p-4 text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  Robotic flat English
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Natural Nigerian Pidgin, Yoruba, & fluent English
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-slate-200">Contact Auto-Save & vCard</td>
                <td className="p-4 text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Google Contacts sync
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Live Leads CRM + 1-Click Excel CSV & Phone vCard (.vcf)
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-slate-200">Document & Proposal Creation</td>
                <td className="p-4 text-slate-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  None
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Generates Word (.doc), Markdown & Web Artifacts
                </td>
              </tr>

              <tr>
                <td className="p-4 font-semibold text-slate-200">Personalized Broadcasts</td>
                <td className="p-4 text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Static text broadcasts
                </td>
                <td className="p-4 text-emerald-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Cancel or change plans anytime via Paystack. No surprise charges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* Starter */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Starter</div>
              <div className="text-3xl font-black text-white">
                ₦{platformPricing.starter_price.toLocaleString()}{" "}
                <span className="text-xs text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-slate-400">
                Ideal for solo founders and boutique businesses starting with automated customer replies.
              </p>
              <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800">
                <li className="flex items-center gap-2">✓ Up to 250 auto-saved contacts</li>
                <li className="flex items-center gap-2">✓ 10 Keyword Auto-responders</li>
                <li className="flex items-center gap-2">✓ 15 hours/mo WebRTC Voice Hotline</li>
                <li className="flex items-center gap-2">✓ CSV & Phone vCard Export</li>
              </ul>
            </div>
            <a
              href="#onboard"
              onClick={() => setForm({ ...form, plan: "starter" })}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold text-center block transition border border-slate-700"
            >
              Choose Starter
            </a>
          </div>

          {/* Pro */}
          <div className="bg-emerald-950/40 border-2 border-emerald-500 rounded-2xl p-6 space-y-4 relative flex flex-col justify-between shadow-2xl shadow-emerald-500/10">
            <span className="absolute -top-3 right-6 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 uppercase tracking-wider">
              Most Popular
            </span>
            <div className="space-y-3">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Pro Business</div>
              <div className="text-3xl font-black text-white">
                ₦{platformPricing.pro_price.toLocaleString()}{" "}
                <span className="text-xs text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-slate-300">
                For established businesses that want full WhatsApp automation, unlimited contacts, and voice calling.
              </p>
              <ul className="text-xs text-slate-200 space-y-2 pt-2 border-t border-emerald-500/30">
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
              onClick={() => setForm({ ...form, plan: "pro" })}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black text-center block transition shadow-lg shadow-emerald-500/25"
            >
              Start {platformPricing.trial_days}-Day Free Trial (Pro)
            </a>
          </div>

          {/* Enterprise */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enterprise / Founder</div>
              <div className="text-3xl font-black text-white">
                ₦{platformPricing.enterprise_price.toLocaleString()}{" "}
                <span className="text-xs text-slate-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-slate-400">
                High-volume organizations, schools, or agencies needing unlimited minutes and multi-agent systems.
              </p>
              <ul className="text-xs text-slate-300 space-y-2 pt-2 border-t border-slate-800">
                <li className="flex items-center gap-2">✓ Full Multi-tenant WhatsApp Bot</li>
                <li className="flex items-center gap-2">✓ <strong>Unlimited</strong> Voice Hotline minutes</li>
                <li className="flex items-center gap-2">✓ Autonomous Web App & Document Generator</li>
                <li className="flex items-center gap-2">✓ Priority 24/7 dedicated support</li>
              </ul>
            </div>
            <a
              href="#onboard"
              onClick={() => setForm({ ...form, plan: "enterprise" })}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold text-center block transition border border-slate-700"
            >
              Choose Enterprise
            </a>
          </div>
        </div>
      </section>

      {/* 60-Second Onboarding Form */}
      <section id="onboard" className="max-w-xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
            <Building2 className="w-3.5 h-3.5" />
            <span>Instant Setup in 60 Seconds</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Register Your Business Workspace
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Create your account now and immediately customize your AI brain, test your hotline, and connect WhatsApp.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleOnboardSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Business Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Havilah Touch Farms"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full bg-slate-850 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Unique Business Handle (URL Slug) *
              </label>
              <div className="flex items-center bg-slate-850 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                <span className="px-3 text-slate-500 text-xs font-mono">.../call?biz=</span>
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
                  className="w-full bg-transparent p-3 text-slate-200 font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Owner Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fadesewa Adeleke"
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Owner WhatsApp Phone *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="2348012345678"
                  value={form.owner_phone}
                  onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="owner@yourbrand.com"
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                className="w-full bg-slate-850 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">Selected Plan</label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full bg-slate-850 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="starter">
                  Starter Plan (₦{platformPricing.starter_price.toLocaleString()}/month)
                </option>
                <option value="pro">
                  Pro Business Plan (₦{platformPricing.pro_price.toLocaleString()}/month) - Recommended
                </option>
                <option value="enterprise">
                  Enterprise / Founder Plan (₦{platformPricing.enterprise_price.toLocaleString()}/month)
                </option>
              </select>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition shadow-xl shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
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

            <p className="text-[11px] text-slate-500 text-center pt-2">
              🔒 {platformPricing.trial_days}-day free trial included. No credit card required to begin setup.
            </p>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-500 space-y-2">
        <p>
          Built by{" "}
          <Link href="/portfolio" className="text-emerald-400 hover:underline font-semibold">
            Femi Adeleke
          </Link>{" "}
          • Elite Full-Stack AI Automation Engineer
        </p>
        <p>© {new Date().getFullYear()} Obey Business. All rights reserved.</p>
      </footer>
    </div>
  );
}
