"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  PhoneCall,
  Zap,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Trash2,
  DollarSign,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  Check,
  CreditCard,
  Copy,
  Lock,
  Key,
} from "lucide-react";

interface WorkspaceWithStats {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string | null;
  plan?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
  whatsapp_instance_name?: string | null;
  whatsapp_status?: string | null;
  lead_count: number;
  call_count: number;
  rule_count: number;
  created_at?: string;
}

interface PlatformPricing {
  starter_price: number;
  pro_price: number;
  enterprise_price: number;
  trial_days: number;
}

export default function AdminMasterControlRoom() {
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithStats[]>([]);
  const [pricing, setPricing] = useState<PlatformPricing>({
    starter_price: 9500,
    pro_price: 22500,
    enterprise_price: 55000,
    trial_days: 7,
  });
  const [stats, setStats] = useState({
    totalWorkspaces: 0,
    activePaid: 0,
    activeTrials: 0,
    totalLeads: 0,
    totalCalls: 0,
    mrrEstimate: 0,
  });
  const [activityFeed, setActivityFeed] = useState<{ leads: any[]; calls: any[] }>({
    leads: [],
    calls: [],
  });

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pricing Form State
  const [pricingForm, setPricingForm] = useState<PlatformPricing>({
    starter_price: 9500,
    pro_price: 22500,
    enterprise_price: 55000,
    trial_days: 7,
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSuccess, setPricingSuccess] = useState(false);

  // Paystack Gateway State
  const [paystackForm, setPaystackForm] = useState({
    secretKey: "",
    publicKey: "",
  });
  const [savingPaystack, setSavingPaystack] = useState(false);
  const [paystackSuccess, setPaystackSuccess] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Passcode Manager State
  const [newPasscode, setNewPasscode] = useState("");
  const [savingPasscode, setSavingPasscode] = useState(false);
  const [passcodeSuccess, setPasscodeSuccess] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  // Manual Plan Grant Modal State
  const [grantModalWs, setGrantModalWs] = useState<WorkspaceWithStats | null>(null);
  const [grantPlan, setGrantPlan] = useState("pro");
  const [grantStatus, setGrantStatus] = useState("active");
  const [extendTrialDays, setExtendTrialDays] = useState("7");
  const [grantLoading, setGrantLoading] = useState(false);

  // Activity Feed Tab
  const [activityTab, setActivityTab] = useState<"leads" | "calls">("leads");

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        fetch("/api/admin/master"),
        fetch("/api/admin/settings"),
      ]);
      const data = await res.json();
      if (data.success) {
        setWorkspaces(data.workspaces || []);
        if (data.pricing) {
          setPricing(data.pricing);
          setPricingForm(data.pricing);
        }
        if (data.stats) setStats(data.stats);
        if (data.activityFeed) setActivityFeed(data.activityFeed);
      }

      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.settings) {
        setPaystackForm({
          secretKey: settingsData.settings.PAYSTACK_SECRET_KEY?.value || "",
          publicKey: settingsData.settings.PAYSTACK_PUBLIC_KEY?.value || "",
        });
      }
    } catch (err) {
      console.error("Failed to load master control room data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePaystack = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPaystack(true);
    setPaystackSuccess(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            PAYSTACK_SECRET_KEY: paystackForm.secretKey.trim(),
            PAYSTACK_PUBLIC_KEY: paystackForm.publicKey.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPaystackSuccess(true);
        setTimeout(() => setPaystackSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Failed to save Paystack keys:", err);
    } finally {
      setSavingPaystack(false);
    }
  };

  const handleUpdatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasscode.trim() || newPasscode.trim().length < 6) {
      setPasscodeError("Passcode must be at least 6 characters long.");
      return;
    }
    setSavingPasscode(true);
    setPasscodeError(null);
    setPasscodeSuccess(false);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPasscode: newPasscode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update passcode");
      }
      setPasscodeSuccess(true);
      setNewPasscode("");
      setTimeout(() => setPasscodeSuccess(false), 4000);
    } catch (err: any) {
      setPasscodeError(err.message || "Failed to update passcode");
    } finally {
      setSavingPasscode(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPricing(true);
    setPricingSuccess(false);
    try {
      const res = await fetch("/api/admin/master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_pricing",
          starter_price: Number(pricingForm.starter_price),
          pro_price: Number(pricingForm.pro_price),
          enterprise_price: Number(pricingForm.enterprise_price),
          trial_days: Number(pricingForm.trial_days),
        }),
      });
      const data = await res.json();
      if (data.success && data.pricing) {
        setPricing(data.pricing);
        setPricingSuccess(true);
        setTimeout(() => setPricingSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save platform pricing:", err);
    } finally {
      setSavingPricing(false);
    }
  };

  const handleGrantPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantModalWs) return;
    setGrantLoading(true);
    try {
      const res = await fetch("/api/admin/master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_plan",
          workspace_id: grantModalWs.id,
          plan: grantPlan,
          subscription_status: grantStatus,
          extend_trial_days: grantStatus === "trial" ? extendTrialDays : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGrantModalWs(null);
        await fetchMasterData();
      }
    } catch (err) {
      console.error("Failed to grant plan:", err);
    } finally {
      setGrantLoading(false);
    }
  };

  const handleDeleteWorkspace = async (wsId: string, wsName: string) => {
    if (!confirm(`Are you sure you want to permanently delete workspace "${wsName}"? All leads, rules, and call logs will be removed.`)) {
      return;
    }
    try {
      const res = await fetch("/api/admin/master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_workspace",
          workspace_id: wsId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMasterData();
      }
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((w) => {
      const matchesSearch =
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.owner_phone.includes(searchQuery) ||
        w.owner_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && w.subscription_status === "active") ||
        (statusFilter === "trial" && w.subscription_status === "trial") ||
        (statusFilter === "connected" && w.whatsapp_status === "connected");

      return matchesSearch && matchesStatus;
    });
  }, [workspaces, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="text-xs font-semibold">Loading Master Control Room...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Platform Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Clients</span>
            <Building2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {stats.totalWorkspaces}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Registered businesses</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Paid Active</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {stats.activePaid}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Full paid subscribers</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Free Trials</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {stats.activeTrials}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">7-Day trial enjoying Pro</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Est. MRR</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white truncate">
            ₦{stats.mrrEstimate.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Monthly recurring</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Leads</span>
            <Users className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {stats.totalLeads}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Captured into CRM</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-bold uppercase tracking-wider">
            <span>Voice Calls</span>
            <PhoneCall className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {stats.totalCalls}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">WebRTC audio calls</p>
        </div>
      </div>

      {/* Package Pricing Controller */}
      <div className="bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Dynamic Package Pricing & Free Trial Controller
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Adjust your platform pricing and free trial duration. All landing page pricing cards and Paystack checkout transactions dynamically update immediately.
            </p>
          </div>

          {pricingSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Pricing Updated Across Platform!
            </span>
          )}
        </div>

        <form onSubmit={handleSavePricing} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-zinc-700 dark:text-zinc-300">
              Starter Plan Price (₦)
            </label>
            <div className="flex items-center bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-zinc-500 font-bold">₦</span>
              <input
                type="number"
                min="1000"
                step="500"
                value={pricingForm.starter_price}
                onChange={(e) =>
                  setPricingForm({ ...pricingForm, starter_price: Number(e.target.value) })
                }
                className="w-full bg-transparent p-2.5 outline-none font-bold text-zinc-900 dark:text-white"
              />
            </div>
            <p className="text-[10px] text-zinc-400">Current: ₦{pricing.starter_price.toLocaleString()}/mo</p>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-zinc-700 dark:text-zinc-300">
              Pro Business Plan Price (₦)
            </label>
            <div className="flex items-center bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-zinc-500 font-bold">₦</span>
              <input
                type="number"
                min="1000"
                step="500"
                value={pricingForm.pro_price}
                onChange={(e) =>
                  setPricingForm({ ...pricingForm, pro_price: Number(e.target.value) })
                }
                className="w-full bg-transparent p-2.5 outline-none font-bold text-zinc-900 dark:text-white"
              />
            </div>
            <p className="text-[10px] text-zinc-400">Current: ₦{pricing.pro_price.toLocaleString()}/mo</p>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-zinc-700 dark:text-zinc-300">
              Enterprise Plan Price (₦)
            </label>
            <div className="flex items-center bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-zinc-500 font-bold">₦</span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={pricingForm.enterprise_price}
                onChange={(e) =>
                  setPricingForm({ ...pricingForm, enterprise_price: Number(e.target.value) })
                }
                className="w-full bg-transparent p-2.5 outline-none font-bold text-zinc-900 dark:text-white"
              />
            </div>
            <p className="text-[10px] text-zinc-400">Current: ₦{pricing.enterprise_price.toLocaleString()}/mo</p>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-zinc-700 dark:text-zinc-300">
              Free Trial Duration (Days)
            </label>
            <div className="flex items-center bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-zinc-500 font-bold">Days</span>
              <input
                type="number"
                min="1"
                max="60"
                value={pricingForm.trial_days}
                onChange={(e) =>
                  setPricingForm({ ...pricingForm, trial_days: Number(e.target.value) })
                }
                className="w-full bg-transparent p-2.5 outline-none font-bold text-zinc-900 dark:text-white ml-2"
              />
            </div>
            <p className="text-[10px] text-zinc-400">New signups get full Pro access</p>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPricing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {savingPricing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Platform Pricing...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Update Package Pricing</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Paystack Payment Gateway Controller */}
      <div className="bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              Paystack Payment Gateway Integration
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Connect your Paystack keys to collect automated subscription payments via Card, USSD, and Direct Bank Transfer.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {paystackForm.secretKey ? (
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Live Gateway Active
              </span>
            ) : (
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                WhatsApp Direct Fallback Mode
              </span>
            )}
            {paystackSuccess && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Keys Saved!
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSavePaystack} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-zinc-700 dark:text-zinc-300">
                Paystack Secret Key (sk_live / sk_test)
              </label>
              <input
                type="password"
                placeholder="Enter your Paystack secret key..."
                value={paystackForm.secretKey}
                onChange={(e) =>
                  setPaystackForm({ ...paystackForm, secretKey: e.target.value })
                }
                className="w-full bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[10px] text-zinc-400">Used server-side to initialize charges and verify signatures.</p>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-700 dark:text-zinc-300">
                Paystack Public Key (pk_live / pk_test)
              </label>
              <input
                type="text"
                placeholder="Enter your Paystack public key..."
                value={paystackForm.publicKey}
                onChange={(e) =>
                  setPaystackForm({ ...paystackForm, publicKey: e.target.value })
                }
                className="w-full bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-2.5 font-mono text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[10px] text-zinc-400">Used for client-side popups and payment triggers.</p>
            </div>
          </div>

          {/* Webhook URL Helper */}
          <div className="p-3.5 bg-zinc-50 dark:bg-slate-900/60 border border-zinc-200 dark:border-slate-800 rounded-xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  Paystack Webhook URL:
                </span>
                <p className="text-[11px] text-zinc-500">
                  Copy and paste this URL into your Paystack Dashboard (Settings &gt; API Keys &amp; Webhooks &gt; Live Webhook URL):
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("https://obeyai.vercel.app/api/obey/billing/webhook");
                  setCopiedWebhook(true);
                  setTimeout(() => setCopiedWebhook(false), 2500);
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-slate-800 hover:bg-zinc-300 dark:hover:bg-slate-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center gap-1.5 shrink-0 transition"
              >
                {copiedWebhook ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Webhook URL</span>
                  </>
                )}
              </button>
            </div>
            <code className="block p-2 bg-white dark:bg-slate-950 border border-zinc-200 dark:border-slate-800 rounded-lg text-emerald-600 dark:text-emerald-400 font-mono text-xs select-all">
              https://obeyai.vercel.app/api/obey/billing/webhook
            </code>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPaystack}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {savingPaystack ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Paystack Keys...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Paystack Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Admin Security & Private Passcode Controller */}
      <div className="bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-500" />
              Admin Dashboard Security & Private Passcode
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Take full charge of your secret passcode. All public hints have been removed from the login screen.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Custom Passcode Active
            </span>

            {passcodeSuccess && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Passcode Updated!
              </span>
            )}
          </div>
        </div>

        {passcodeError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} />
            {passcodeError}
          </div>
        )}

        <form onSubmit={handleUpdatePasscode} className="space-y-4 text-xs">
          <div className="max-w-md space-y-1">
            <label className="font-bold text-zinc-700 dark:text-zinc-300">
              Set New Private Passcode
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="Enter new secret passcode (min 6 characters)..."
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl font-mono text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
              <Key size={15} className="absolute left-3 top-3 text-zinc-400" />
            </div>
            <p className="text-[10px] text-zinc-400">
              Saved directly to your encrypted database settings. It takes effect immediately across all devices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={savingPasscode}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-md shadow-purple-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {savingPasscode ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating Passcode...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Update Admin Passcode</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-zinc-500">
              Forgot your passcode? You can always unlock via your Vercel <code className="text-zinc-700 dark:text-zinc-300 font-bold">ADMIN_MASTER_KEY</code> environment variable or ask your assistant to reset it.
            </span>
          </div>
        </form>
      </div>

      {/* Client Workspaces Management */}
      <div className="bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-500" />
              Client Workspaces & Manual Plan Grants
            </h2>
            <p className="text-xs text-zinc-500">
              Manage client accounts, view connection status, and manually grant plans without payment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center bg-zinc-100 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white w-56">
              <Search className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search business or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none w-full"
              />
            </div>

            {/* Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-100 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white outline-none cursor-pointer font-medium"
            >
              <option value="all">All Clients ({workspaces.length})</option>
              <option value="paid">Paid Active</option>
              <option value="trial">Free Trial</option>
              <option value="connected">WhatsApp Connected</option>
            </select>

            <button
              onClick={fetchMasterData}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Workspaces Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-100 dark:bg-slate-900 text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5 font-bold">Business & Handle</th>
                <th className="p-3.5 font-bold">Owner Details</th>
                <th className="p-3.5 font-bold">Plan & Status</th>
                <th className="p-3.5 font-bold">WhatsApp Instance</th>
                <th className="p-3.5 font-bold">CRM Activity</th>
                <th className="p-3.5 font-bold text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredWorkspaces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500 font-medium">
                    No client workspaces match your filter.
                  </td>
                </tr>
              ) : (
                filteredWorkspaces.map((ws) => {
                  const isTrial = ws.subscription_status === "trial";
                  const trialEnds = ws.trial_ends_at ? new Date(ws.trial_ends_at) : null;
                  const daysLeft = trialEnds
                    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                    : null;

                  return (
                    <tr key={ws.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition">
                      {/* Business & Slug */}
                      <td className="p-3.5 space-y-0.5">
                        <div className="font-bold text-zinc-900 dark:text-white text-sm">
                          {ws.name}
                        </div>
                        <div className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                          /call?biz={ws.slug}
                        </div>
                      </td>

                      {/* Owner Details */}
                      <td className="p-3.5 space-y-0.5">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {ws.owner_name}
                        </div>
                        <a
                          href={`https://wa.me/${ws.owner_phone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-zinc-500 hover:text-emerald-500 flex items-center gap-1 text-[11px]"
                        >
                          <MessageSquare className="w-3 h-3 text-emerald-500" />
                          <span>+{ws.owner_phone}</span>
                        </a>
                      </td>

                      {/* Plan & Status */}
                      <td className="p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-slate-700">
                            {ws.plan || "Starter"}
                          </span>
                        </div>
                        {isTrial ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{daysLeft !== null ? `${daysLeft}d left on Trial` : "Trial Active"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Paid Active</span>
                          </span>
                        )}
                      </td>

                      {/* WhatsApp Instance */}
                      <td className="p-3.5 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ws.whatsapp_status === "connected"
                                ? "bg-emerald-500 animate-pulse"
                                : "bg-zinc-400"
                            }`}
                          />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-[11px] capitalize">
                            {ws.whatsapp_status || "Disconnected"}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400 block truncate max-w-[140px]">
                          {ws.whatsapp_instance_name || `obey-${ws.slug}`}
                        </span>
                      </td>

                      {/* CRM Activity */}
                      <td className="p-3.5 space-y-0.5 text-[11px]">
                        <div>
                          <strong className="text-zinc-800 dark:text-zinc-200">{ws.lead_count}</strong> leads captured
                        </div>
                        <div className="text-zinc-500">
                          <strong className="text-zinc-700 dark:text-zinc-300">{ws.call_count}</strong> voice calls • <strong className="text-zinc-700 dark:text-zinc-300">{ws.rule_count}</strong> rules
                        </div>
                      </td>

                      {/* Quick Actions */}
                      <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setGrantModalWs(ws);
                            setGrantPlan(ws.plan || "pro");
                            setGrantStatus(ws.subscription_status || "active");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 transition text-[11px] cursor-pointer"
                          title="Manually grant plan or extend trial without payment"
                        >
                          Manage Plan
                        </button>

                        <Link
                          href={`/control-room?biz=${ws.slug}`}
                          target="_blank"
                          className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold border border-zinc-300 dark:border-slate-700 transition text-[11px] inline-flex items-center gap-1"
                          title="Open Client Dashboard"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>

                        <button
                          onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-red-500 transition cursor-pointer"
                          title="Delete workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Activity Feed */}
      <div className="bg-white dark:bg-[#0b1424] border border-zinc-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h2 className="text-base font-black text-zinc-900 dark:text-white">
              Global Platform Activity Stream
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-slate-900 p-1 rounded-xl border border-zinc-200 dark:border-slate-800 text-xs font-bold">
            <button
              onClick={() => setActivityTab("leads")}
              className={`px-3 py-1 rounded-lg transition ${
                activityTab === "leads"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Captured Leads ({activityFeed.leads.length})
            </button>
            <button
              onClick={() => setActivityTab("calls")}
              className={`px-3 py-1 rounded-lg transition ${
                activityTab === "calls"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Voice Hotline Calls ({activityFeed.calls.length})
            </button>
          </div>
        </div>

        {activityTab === "leads" ? (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 text-xs">
            {activityFeed.leads.length === 0 ? (
              <p className="text-center py-8 text-zinc-500">No leads recorded across platform yet.</p>
            ) : (
              activityFeed.leads.map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-3 rounded-xl bg-zinc-50 dark:bg-slate-900/50 border border-zinc-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {lead.name || "WhatsApp Contact"}
                      </span>
                      <span className="font-mono text-zinc-500 text-[11px]">+{lead.phone}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {lead.workspace_name}
                      </span>
                    </div>
                    {lead.intent_summary && (
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1">
                        {lead.intent_summary}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                    {new Date(lead.updated_at || lead.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 text-xs">
            {activityFeed.calls.length === 0 ? (
              <p className="text-center py-8 text-zinc-500">No voice calls recorded across platform yet.</p>
            ) : (
              activityFeed.calls.map((call: any) => (
                <div
                  key={call.id}
                  className="p-3 rounded-xl bg-zinc-50 dark:bg-slate-900/50 border border-zinc-200 dark:border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {call.caller_name || "Web Caller"}
                      </span>
                      {call.caller_phone && (
                        <span className="font-mono text-zinc-500 text-[11px]">+{call.caller_phone}</span>
                      )}
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        {call.workspace_name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-teal-500 font-bold">
                      {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                    </span>
                  </div>
                  {call.summary && (
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
                      {call.summary}
                    </p>
                  )}
                  {call.recording_url && (
                    <audio controls src={call.recording_url} className="w-full h-7 rounded pt-1" />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Manual Plan Grant Modal */}
      {grantModalWs && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0b1424] border border-zinc-300 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-slate-800 pb-3">
              <h3 className="font-black text-zinc-900 dark:text-white text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Manual Plan & Trial Override
              </h3>
              <button
                onClick={() => setGrantModalWs(null)}
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-zinc-100 dark:bg-slate-900 rounded-xl space-y-0.5 text-xs">
              <span className="text-zinc-500 block">Target Business:</span>
              <strong className="text-zinc-900 dark:text-white text-sm">{grantModalWs.name}</strong>
              <span className="text-zinc-400 block font-mono text-[11px]">Slug: {grantModalWs.slug} • Phone: +{grantModalWs.owner_phone}</span>
            </div>

            <form onSubmit={handleGrantPlan} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Assign Package Plan
                </label>
                <select
                  value={grantPlan}
                  onChange={(e) => setGrantPlan(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-2.5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="starter" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Starter Plan</option>
                  <option value="pro" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Pro Business Plan (Recommended)</option>
                  <option value="enterprise" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Enterprise Plan</option>
                  <option value="lifetime" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Lifetime Free VIP</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Subscription Status
                </label>
                <select
                  value={grantStatus}
                  onChange={(e) => setGrantStatus(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-2.5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="active" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Paid Active (Full Unlocked Access)</option>
                  <option value="trial" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Free Trial Extension</option>
                  <option value="expired" className="bg-white dark:bg-slate-900 text-zinc-900 dark:text-white">Expired / Inactive</option>
                </select>
              </div>

              {grantStatus === "trial" && (
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Extend Trial by (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={extendTrialDays}
                    onChange={(e) => setExtendTrialDays(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-slate-900 border border-zinc-300 dark:border-slate-700 rounded-xl p-2.5 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Sets new expiration date counting from today.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={grantLoading}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {grantLoading ? "Updating Workspace..." : "Apply Plan Override Immediately"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
