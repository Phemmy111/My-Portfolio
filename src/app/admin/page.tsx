"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Mail,
  Briefcase,
  Inbox,
  Plus,
  Send,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  LogOut,
  Sparkles,
  TrendingUp,
  Clock,
  Layers,
  ChevronRight,
  MessageCircle,
  RefreshCw,
  Zap,
  Bot,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
} from "lucide-react";
import { Lead, Proposal, Inquiry } from "@/lib/admin-store";
import ObeyChatConsole from "@/components/ObeyChatConsole";
import ObeyFloatingAssistant from "@/components/ObeyFloatingAssistant";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"leads" | "proposals" | "inquiries" | "obey">("leads");
  const [loading, setLoading] = useState(true);

  // Agent Obey state
  const [agentTasks, setAgentTasks] = useState<any[]>([]);
  const [hunting, setHunting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Data states
  const [leads, setLeads] = useState<Lead[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeLeads: 0,
    convertedLeads: 0,
    totalProposals: 0,
    totalInquiries: 0,
    unreadInquiries: 0,
  });

  // UI interaction states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [activePitchLead, setActivePitchLead] = useState<Lead | null>(null);

  // New Lead form
  const [newLead, setNewLead] = useState({
    name: "",
    company: "",
    email: "",
    serviceNeeded: "Automation / n8n" as Lead["serviceNeeded"],
    niche: "",
    notes: "",
    specificPainPoint: "",
  });

  // Proposal Generator form
  const [proposalForm, setProposalForm] = useState({
    platform: "Upwork" as Proposal["platform"],
    jobTitle: "",
    jobDescription: "",
    angle: "Rapid Automation & Speed" as Proposal["angle"],
  });
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [latestProposalMeta, setLatestProposalMeta] = useState<any>(null);

  // Load initial data and verify auth
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const authRes = await fetch("/api/admin/auth");
      const authData = await authRes.json();
      if (!authData.authenticated) {
        router.push("/admin/login");
        return;
      }

      // Fetch leads, proposals, inquiries, and Obey tasks
      const [leadsRes, proposalsRes, inquiriesRes, obeyRes] = await Promise.all([
        fetch("/api/admin/leads"),
        fetch("/api/admin/proposals"),
        fetch("/api/admin/inquiries"),
        fetch("/api/obey/tasks"),
      ]);

      if (leadsRes.ok) {
        const lData = await leadsRes.json();
        setLeads(lData.leads || []);
        if (lData.stats) setStats(lData.stats);
      }
      if (proposalsRes.ok) {
        const pData = await proposalsRes.json();
        setProposals(pData.proposals || []);
      }
      if (inquiriesRes.ok) {
        const iData = await inquiriesRes.json();
        setInquiries(iData.inquiries || []);
      }
      if (obeyRes.ok) {
        const oData = await obeyRes.json();
        setAgentTasks(oData.tasks || []);
      }
    } catch {
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const handleRunHunt = async (actionType: "hunt_all" | "hunt_upwork" | "hunt_b2b" = "hunt_all") => {
    setHunting(true);
    try {
      const res = await fetch("/api/obey/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionType }),
      });
      const data = await res.json();
      if (data.tasks) {
        setAgentTasks((prev) => [...data.tasks, ...prev]);
      }
    } catch (err) {
      console.error("Hunt error:", err);
    } finally {
      setHunting(false);
    }
  };

  const handleApproveTask = async (id: string, token: string) => {
    setActionInProgress(id);
    try {
      const res = await fetch("/api/obey/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id, token }),
      });
      const data = await res.json();
      if (data.success) {
        setAgentTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, status: "executed", execution_result: "Dispatched via Gmail SMTP" } : t
          )
        );
      }
    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectTask = async (id: string, token: string) => {
    setActionInProgress(id);
    try {
      const res = await fetch("/api/obey/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", id, token }),
      });
      const data = await res.json();
      if (data.success) {
        setAgentTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "rejected" } : t))
        );
      }
    } catch (err) {
      console.error("Reject error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Add new lead
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLead),
      });
      if (res.ok) {
        setShowAddLeadModal(false);
        setNewLead({
          name: "",
          company: "",
          email: "",
          serviceNeeded: "Automation / n8n",
          niche: "",
          notes: "",
          specificPainPoint: "",
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update lead status
  const handleUpdateLeadStatus = async (id: string, status: Lead["status"]) => {
    await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, updates: { status } }),
    });
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  // Delete lead
  const handleDeleteLead = async (id: string) => {
    if (!confirm("Are you sure you want to remove this lead?")) return;
    await fetch(`/api/admin/leads?id=${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // Generate Proposal
  const handleGenerateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingProposal(true);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposalForm),
      });
      if (res.ok) {
        const data = await res.json();
        setLatestProposalMeta(data.meta);
        setProposals((prev) => [data.proposal, ...prev]);
        setProposalForm((prev) => ({ ...prev, jobTitle: "", jobDescription: "" }));
      }
    } finally {
      setGeneratingProposal(false);
    }
  };

  // Delete Proposal
  const handleDeleteProposal = async (id: string) => {
    await fetch(`/api/admin/proposals?id=${id}`, { method: "DELETE" });
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  // Update Inquiry Status
  const handleUpdateInquiryStatus = async (id: string, status: Inquiry["status"]) => {
    await fetch("/api/admin/inquiries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  };

  // Delete Inquiry
  const handleDeleteInquiry = async (id: string) => {
    await fetch(`/api/admin/inquiries?id=${id}`, { method: "DELETE" });
    setInquiries((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#dfe3e8] dark:bg-black flex items-center justify-center text-zinc-950 dark:text-white font-bold">
        <div className="flex items-center gap-3">
          <RefreshCw size={20} className="animate-spin text-emerald-600" />
          Loading Command Center...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#dfe3e8] dark:bg-black text-zinc-950 dark:text-white font-sans pb-24">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#dfe3e8]/90 dark:bg-black/90 backdrop-blur-md border-b border-zinc-400/40 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-zinc-400 dark:border-zinc-700 shadow-sm shrink-0">
              <Image
                src="/femi-headshot.webp"
                alt="Femi Adeleke"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg tracking-tight">Femi Adeleke</h1>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  Command Center
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
                AutoLearn Spot & Freelance Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-400 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-600 transition-colors"
            >
              <ExternalLink size={13} />
              View Portfolio
            </a>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-zinc-700 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-xs">
            <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Leads</span>
              <Mail size={16} />
            </div>
            <p className="text-3xl font-black">{stats.totalLeads}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-semibold">
              {stats.activeLeads} active · {stats.convertedLeads} converted
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-xs">
            <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Gig Proposals</span>
              <Briefcase size={16} />
            </div>
            <p className="text-3xl font-black">{proposals.length}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-semibold">
              Upwork & Fiverr engines
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-xs">
            <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Inquiries</span>
              <Inbox size={16} />
            </div>
            <p className="text-3xl font-black">{inquiries.length}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-semibold">
              {inquiries.filter((i) => i.status === "unread").length} unread messages
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-xs">
            <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Stack Status</span>
              <Zap size={16} className="text-emerald-500" />
            </div>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">Ready & Synced</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-semibold">
              Neon DB / Local Hybrid
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-3">
          <button
            onClick={() => setActiveTab("leads")}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "leads"
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                : "text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <Mail size={16} />
            Cold Mailing Automator
            <span className="text-xs opacity-75">({leads.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("proposals")}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "proposals"
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                : "text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <Briefcase size={16} />
            Freelance Gig Automator (Upwork & Fiverr)
            <span className="text-xs opacity-75">({proposals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("inquiries")}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "inquiries"
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                : "text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <Inbox size={16} />
            Website Inquiries
            {inquiries.some((i) => i.status === "unread") && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("obey")}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "obey"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "text-zinc-700 dark:text-zinc-400 hover:text-black dark:hover:text-white"
            }`}
          >
            <Bot size={16} className={activeTab === "obey" ? "text-white" : "text-emerald-500"} />
            Agent Obey (AI Assistant)
            {agentTasks.some((t) => t.status === "pending_approval") && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400 text-black">
                {agentTasks.filter((t) => t.status === "pending_approval").length} pending
              </span>
            )}
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: COLD MAILING AUTOMATOR */}
        {/* ============================================================ */}
        {activeTab === "leads" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Cold Mailing Pipeline</h2>
                <p className="text-sm text-zinc-700 dark:text-zinc-400 font-medium">
                  Add target businesses and let the AI engine generate custom high-converting pitches automatically.
                </p>
              </div>
              <button
                onClick={() => setShowAddLeadModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-sm font-bold shadow-md hover:scale-105 transition-all"
              >
                <Plus size={16} />
                Add New Lead
              </button>
            </div>

            {/* Leads Table / Cards */}
            <div className="grid gap-4">
              {leads.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-400 dark:border-zinc-800 bg-white/50 dark:bg-[#080808]/50">
                  <p className="font-bold text-zinc-600 dark:text-zinc-400">No leads added yet.</p>
                  <button
                    onClick={() => setShowAddLeadModal(true)}
                    className="mt-3 text-xs font-bold underline"
                  >
                    Add your first target lead
                  </button>
                </div>
              ) : (
                leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-6 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] shadow-sm hover:border-black dark:hover:border-zinc-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-zinc-950 dark:text-white">
                          {lead.name}
                        </h3>
                        {lead.company && (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-[#141414] text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-800">
                            {lead.company}
                          </span>
                        )}
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-[#1a1a1a] text-zinc-900 dark:text-zinc-200">
                          {lead.niche}
                        </span>
                      </div>

                      <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{lead.email}</p>

                      {lead.notes && (
                        <p className="text-xs text-zinc-800 dark:text-zinc-400 font-medium">
                          <strong className="text-black dark:text-white font-bold">Notes:</strong> {lead.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions and Status */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                      {/* Status Selector */}
                      <select
                        value={lead.status}
                        onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value as Lead["status"])}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border focus:outline-none ${
                          lead.status === "converted"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            : lead.status === "contacted"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                            : lead.status === "replied"
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"
                            : "bg-zinc-100 dark:bg-[#121212] text-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-800"
                        }`}
                      >
                        <option value="new">New Lead</option>
                        <option value="drafted">Draft Ready</option>
                        <option value="contacted">Sent Email</option>
                        <option value="replied">Client Replied</option>
                        <option value="converted">Won / Closed</option>
                      </select>

                      {/* View & Copy Pitch */}
                      <button
                        onClick={() => setActivePitchLead(lead)}
                        className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-600 text-xs font-bold flex items-center gap-1.5 bg-zinc-50 dark:bg-[#121212]"
                      >
                        <Sparkles size={13} className="text-emerald-500" />
                        View Pitch
                      </button>

                      {/* Open Mail Client */}
                      {lead.draftSubject && lead.draftBody && (
                        <a
                          href={`mailto:${lead.email}?subject=${encodeURIComponent(
                            lead.draftSubject
                          )}&body=${encodeURIComponent(lead.draftBody)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold flex items-center gap-1.5"
                        >
                          <Send size={13} />
                          Send Mail
                        </a>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                        title="Delete lead"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: FREELANCE GIG AUTOMATOR (UPWORK & FIVERR) */}
        {/* ============================================================ */}
        {activeTab === "proposals" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Freelance Gig Automator</h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-400 font-medium">
                Paste any client job description from Upwork, Fiverr, or direct outreach. The engine automatically matches your relevant portfolio projects (OKIKI Store, AutoLearn Spot, n8n automations) and outputs winning proposals.
              </p>
            </div>

            {/* Generator Form */}
            <form
              onSubmit={handleGenerateProposal}
              className="p-6 rounded-3xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] space-y-4 shadow-sm"
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-1.5">
                    Platform
                  </label>
                  <select
                    value={proposalForm.platform}
                    onChange={(e) =>
                      setProposalForm((prev) => ({
                        ...prev,
                        platform: e.target.value as Proposal["platform"],
                      }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212] font-semibold text-sm"
                  >
                    <option value="Upwork">Upwork (Long-Form & Milestones)</option>
                    <option value="Fiverr">Fiverr (Punchy Buyer Request / Offer)</option>
                    <option value="Direct Client">Direct Client / Email Pitch</option>
                    <option value="LinkedIn">LinkedIn InMail / DM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-1.5">
                    Strategy Angle
                  </label>
                  <select
                    value={proposalForm.angle}
                    onChange={(e) =>
                      setProposalForm((prev) => ({
                        ...prev,
                        angle: e.target.value as Proposal["angle"],
                      }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212] font-semibold text-sm"
                  >
                    <option value="Rapid Automation & Speed">Rapid Automation & Speed (Hit Ground Running)</option>
                    <option value="High Authority Lead">High Authority Lead (Senior Architectural Design)</option>
                    <option value="ROI & Value Focus">ROI & Value Focus (Business Impact & Conversion)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-1.5">
                  Job Post Title *
                </label>
                <input
                  required
                  value={proposalForm.jobTitle}
                  onChange={(e) =>
                    setProposalForm((prev) => ({ ...prev, jobTitle: e.target.value }))
                  }
                  placeholder="e.g. Build an automated n8n pipeline for e-commerce store sync"
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212] text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-400 mb-1.5">
                  Client Job Description *
                </label>
                <textarea
                  required
                  rows={4}
                  value={proposalForm.jobDescription}
                  onChange={(e) =>
                    setProposalForm((prev) => ({ ...prev, jobDescription: e.target.value }))
                  }
                  placeholder="Paste the full job post text from Upwork or Fiverr here..."
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212] text-sm font-medium resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={generatingProposal}
                className="px-6 py-3 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                <Sparkles size={16} className="text-emerald-500" />
                {generatingProposal ? "Generating Winning Proposal..." : "Generate Winning Proposal"}
              </button>
            </form>

            {/* Generated Proposal History */}
            <div className="space-y-4">
              <h3 className="text-lg font-black tracking-tight">Generated Proposals Archive</h3>

              {proposals.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">No proposals generated yet.</p>
              ) : (
                proposals.map((prop) => (
                  <div
                    key={prop.id}
                    className="p-6 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] space-y-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-[#1a1a1a] mr-2">
                          {prop.platform}
                        </span>
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                          {prop.angle}
                        </span>
                        <h4 className="font-black text-base mt-1 text-zinc-950 dark:text-white">
                          {prop.jobTitle}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(prop.generatedProposal, prop.id)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-zinc-600 text-xs font-bold flex items-center gap-1.5"
                        >
                          {copiedId === prop.id ? (
                            <>
                              <Check size={14} className="text-emerald-500" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              Copy Proposal
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteProposal(prop.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                          title="Delete proposal"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Proposal Preview Box */}
                    <div className="p-4 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-300 dark:border-zinc-800 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-900 dark:text-zinc-200">
                      {prop.generatedProposal}
                    </div>

                    {prop.relevantProjects && prop.relevantProjects.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-bold text-zinc-500">Cited Projects:</span>
                        {prop.relevantProjects.map((p) => (
                          <span
                            key={p}
                            className="text-xs px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-[#1e1e1e] font-semibold text-black dark:text-zinc-200"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: CLIENT INQUIRIES INBOX */}
        {/* ============================================================ */}
        {activeTab === "inquiries" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Website Inquiries Inbox</h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-400 font-medium">
                Client submissions from the portfolio contact form.
              </p>
            </div>

            <div className="grid gap-4">
              {inquiries.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-400 dark:border-zinc-800 bg-white/50 dark:bg-[#080808]/50">
                  <p className="font-bold text-zinc-600 dark:text-zinc-400">No messages yet.</p>
                </div>
              ) : (
                inquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className={`p-6 rounded-2xl border bg-white dark:bg-[#080808] transition-all space-y-3 ${
                      inq.status === "unread"
                        ? "border-emerald-500/50 dark:border-emerald-500/40 shadow-md"
                        : "border-zinc-300 dark:border-zinc-800 opacity-90"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-base text-zinc-950 dark:text-white">
                          {inq.name}
                        </h4>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-[#181818] text-zinc-800 dark:text-zinc-300">
                          {inq.service}
                        </span>
                        {inq.status === "unread" && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            New
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Status Toggle */}
                        <select
                          value={inq.status}
                          onChange={(e) =>
                            handleUpdateInquiryStatus(inq.id, e.target.value as Inquiry["status"])
                          }
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#121212]"
                        >
                          <option value="unread">Unread</option>
                          <option value="read">Read</option>
                          <option value="replied">Replied</option>
                        </select>

                        {/* Reply via email */}
                        <a
                          href={`mailto:${inq.email}?subject=${encodeURIComponent(
                            `Re: Your project inquiry regarding ${inq.service}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold flex items-center gap-1"
                        >
                          <Mail size={12} />
                          Reply
                        </a>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteInquiry(inq.id)}
                          className="p-1 text-zinc-500 hover:text-red-500 transition-colors"
                          title="Delete message"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{inq.email}</p>

                    <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#101010] border border-zinc-200 dark:border-zinc-800/80 text-sm leading-relaxed text-zinc-900 dark:text-zinc-200">
                      {inq.message}
                    </div>

                    <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                      Received: {new Date(inq.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: AGENT OBEY (AI PERSONAL ASSISTANT) */}
        {/* ============================================================ */}
        {activeTab === "obey" && (
          <div className="space-y-8">
            {/* Agent Obey Executive Header Card */}
            <div className="p-8 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-zinc-900/40 to-black relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Bot size={180} className="text-emerald-400" />
              </div>

              <div className="relative z-10 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500 text-black flex items-center gap-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                    Agent Obey · 24/7 Active
                  </span>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                    Human-In-The-Loop (HITL) Mode
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Obey — Your Autonomous AI Operations Assistant
                  </h2>
                  <p className="text-sm text-zinc-400 max-w-2xl mt-1 leading-relaxed">
                    Obey monitors business markets, hunts companies needing your expertise, crafts tailored pitches, and delivers 1-click approval requests directly to your phone. Nothing is sent without your green light.
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleRunHunt("hunt_all")}
                    disabled={hunting}
                    className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
                  >
                    {hunting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Scouting Real Opportunities...
                      </>
                    ) : (
                      <>
                        <Zap size={15} fill="currentColor" />
                        ⚡ Run Dual-Stream Scout (All)
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleRunHunt("hunt_upwork")}
                    disabled={hunting}
                    className="px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 border border-zinc-700 transition-all disabled:opacity-50"
                  >
                    <Briefcase size={15} className="text-blue-400" />
                    Scout Upwork Live Jobs
                  </button>

                  <button
                    onClick={() => handleRunHunt("hunt_b2b")}
                    disabled={hunting}
                    className="px-4 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 border border-zinc-700 transition-all disabled:opacity-50"
                  >
                    <Mail size={15} className="text-amber-400" />
                    Hunt Real B2B Decision-Makers
                  </button>
                </div>

                <p className="text-xs text-zinc-500 font-semibold pt-1">
                  💡 Obey pulls live Upwork client postings with budgets and verifies B2B emails with 1-click approvals sent to femiadeleke2020@gmail.com
                </p>
              </div>
            </div>

            {/* Interactive Chat with Obey AI Assistant */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-zinc-950 dark:text-white flex items-center gap-2">
                    <Bot size={20} className="text-emerald-500" />
                    Interactive Chat with Obey
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Command Obey conversationally — scout live gigs, hunt B2B prospects, approve actions, or query metrics.
                  </p>
                </div>
              </div>

              <ObeyChatConsole onTaskUpdated={fetchData} />
            </div>

            {/* Connected Apps & Integrations Ecosystem */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-3">
                Connected Autonomous Ecosystem
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-950 dark:text-white">Gmail SMTP</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Connected (Live)</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                    <Zap size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-950 dark:text-white">Neon PostgreSQL</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Cloud Persistent</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-950 dark:text-white">Upwork & Fiverr</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Proposal Generator</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-950 dark:text-white">WhatsApp Bot</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">● Configured (08120934828)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Approvals Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-zinc-950 dark:text-white flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-500" />
                    Pending Human Authorization Queue
                  </h3>
                  <p className="text-xs text-zinc-500 font-semibold">
                    Actions found by Obey that will only execute when you click Approve.
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                  {agentTasks.filter((t) => t.status === "pending_approval").length} awaiting decision
                </span>
              </div>

              {agentTasks.filter((t) => t.status === "pending_approval").length === 0 ? (
                <div className="p-12 text-center rounded-3xl border border-dashed border-zinc-400 dark:border-zinc-800 bg-white/40 dark:bg-[#080808]/40 space-y-3">
                  <Bot size={36} className="mx-auto text-zinc-400" />
                  <p className="font-bold text-zinc-700 dark:text-zinc-300">
                    No pending actions right now.
                  </p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Click &ldquo;Run Autonomous Lead Hunter Now&rdquo; above and Obey will search for target businesses and draft cold outreach for your approval.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {agentTasks
                    .filter((t) => t.status === "pending_approval")
                    .map((task) => (
                      <div
                        key={task.id}
                        className="p-6 rounded-3xl border border-amber-500/40 bg-white dark:bg-[#080808] shadow-lg space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              Awaiting Your Approval
                            </span>
                            <h4 className="font-black text-lg text-zinc-950 dark:text-white mt-1">
                              {task.title}
                            </h4>
                            <p className="text-xs text-zinc-500 font-mono">
                              Recipient: {task.target_name} ({task.target_email || "Platform direct"})
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApproveTask(task.id, task.approval_token)}
                              disabled={actionInProgress === task.id}
                              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                            >
                              <CheckCircle2 size={15} />
                              {actionInProgress === task.id ? "Dispatching..." : "Approve & Send via SMTP"}
                            </button>
                            <button
                              onClick={() => handleRejectTask(task.id, task.approval_token)}
                              disabled={actionInProgress === task.id}
                              className="px-4 py-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-red-500/20 text-zinc-800 dark:text-zinc-300 hover:text-red-500 font-bold text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              <XCircle size={15} />
                              Reject
                            </button>
                          </div>
                        </div>

                        {task.subject && (
                          <div className="p-3 rounded-xl bg-zinc-100 dark:bg-[#121212] border border-zinc-300 dark:border-zinc-800 text-xs">
                            <span className="font-bold text-zinc-500 uppercase text-[10px] block mb-0.5">Subject Line</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{task.subject}</span>
                          </div>
                        )}

                        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#101010] border border-zinc-200 dark:border-zinc-800/80 text-xs font-mono leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-300">
                          {task.payload}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Executed Action History Log */}
            <div className="space-y-4 pt-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Action Execution History
              </h3>

              {agentTasks.filter((t) => t.status !== "pending_approval").length === 0 ? (
                <p className="text-xs text-zinc-500 font-semibold">No executed actions in this session yet.</p>
              ) : (
                <div className="grid gap-3">
                  {agentTasks
                    .filter((t) => t.status !== "pending_approval")
                    .map((task) => (
                      <div
                        key={task.id}
                        className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-[#080808] flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          {task.status === "executed" ? (
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle size={18} className="text-red-500 shrink-0" />
                          )}
                          <div>
                            <p className="font-bold text-xs text-zinc-950 dark:text-white">{task.title}</p>
                            <p className="text-[11px] text-zinc-500 font-mono">
                              {task.target_email || task.target_name} · {task.execution_result || task.status}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            task.status === "executed"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* MODAL: ADD NEW TARGET LEAD */}
      {/* ============================================================ */}
      {showAddLeadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#0a0a0a] border border-zinc-300 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black tracking-tight">Add Target Business Lead</h3>
              <button
                onClick={() => setShowAddLeadModal(false)}
                className="text-zinc-500 hover:text-black dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact Name *
                  </label>
                  <input
                    required
                    value={newLead.name}
                    onChange={(e) => setNewLead((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Tunde Balogun"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Company Name
                  </label>
                  <input
                    value={newLead.company}
                    onChange={(e) => setNewLead((prev) => ({ ...prev, company: e.target.value }))}
                    placeholder="e.g. Zenith Logistics"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={newLead.email}
                    onChange={(e) => setNewLead((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="tunde@zenith.com"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Industry / Niche
                  </label>
                  <input
                    value={newLead.niche}
                    onChange={(e) => setNewLead((prev) => ({ ...prev, niche: e.target.value }))}
                    placeholder="e.g. E-Commerce, Logistics"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Service Needed
                </label>
                <select
                  value={newLead.serviceNeeded}
                  onChange={(e) =>
                    setNewLead((prev) => ({
                      ...prev,
                      serviceNeeded: e.target.value as Lead["serviceNeeded"],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                >
                  <option value="Automation / n8n">Automation & n8n Workflows</option>
                  <option value="Web Development">Full-Stack Web Development (Next.js)</option>
                  <option value="AI Integration">AI Agents & Workflows</option>
                  <option value="Video / Content">Video Editing & Content Direction</option>
                  <option value="Other">Other Digital Strategy</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Specific Pain Point (Optional)
                </label>
                <input
                  value={newLead.specificPainPoint}
                  onChange={(e) =>
                    setNewLead((prev) => ({ ...prev, specificPainPoint: e.target.value }))
                  }
                  placeholder="e.g. manual dispatch tracking, slow loading website"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={newLead.notes}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any extra context..."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#141414] text-xs font-medium resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-300 dark:border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md"
                >
                  Save & Auto-Generate Pitch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VIEW COLD PITCH DRAWER */}
      {/* ============================================================ */}
      {activePitchLead && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#0a0a0a] border border-zinc-300 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black">
                  Tailored Pitch for {activePitchLead.name}
                </h3>
                <p className="text-xs text-zinc-500 font-mono">{activePitchLead.email}</p>
              </div>
              <button
                onClick={() => setActivePitchLead(null)}
                className="text-zinc-500 hover:text-black dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Subject Line
                </label>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-100 dark:bg-[#141414] border border-zinc-300 dark:border-zinc-800 text-xs font-mono">
                  <span className="flex-1">{activePitchLead.draftSubject}</span>
                  <button
                    onClick={() =>
                      copyToClipboard(activePitchLead.draftSubject || "", "subject")
                    }
                    className="p-1 text-zinc-600 hover:text-black dark:hover:text-white"
                  >
                    {copiedId === "subject" ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Email Body
                </label>
                <div className="relative p-4 rounded-xl bg-zinc-100 dark:bg-[#141414] border border-zinc-300 dark:border-zinc-800 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                  {activePitchLead.draftBody}
                  <button
                    onClick={() => copyToClipboard(activePitchLead.draftBody || "", "body")}
                    className="absolute top-3 right-3 p-1.5 rounded-md bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 shadow-xs"
                    title="Copy email body"
                  >
                    {copiedId === "body" ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <a
                  href={`mailto:${activePitchLead.email}?subject=${encodeURIComponent(
                    activePitchLead.draftSubject || ""
                  )}&body=${encodeURIComponent(activePitchLead.draftBody || "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold flex items-center gap-2 shadow-md"
                >
                  <Send size={13} />
                  Open in Email Client
                </a>

                <button
                  onClick={() => setActivePitchLead(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-300 dark:border-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Obey Assistant Drawer (Accessible across all tabs) */}
      <ObeyFloatingAssistant onTaskUpdated={fetchData} />
    </div>
  );
}
