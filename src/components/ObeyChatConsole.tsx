"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Sparkles,
  Zap,
  Briefcase,
  Mail,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface ActionCard {
  id: string;
  title: string;
  subtitle?: string;
  details?: string;
  badge?: string;
  link?: string;
  approvalToken?: string;
  status?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  cards?: ActionCard[];
}

interface ObeyChatConsoleProps {
  onTaskUpdated?: () => void;
}

export default function ObeyChatConsole({ onTaskUpdated }: ObeyChatConsoleProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello Femi! I'm **Obey**, your autonomous personal assistant. I'm connected to your Neon PostgreSQL database, Gmail SMTP, and live freelance feeds.\n\nTell me what to scout, hunt, or execute, or tap any quick action below.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customText) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/obey/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend.trim(),
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.reply) {
        const assistantMessage: Message = {
          id: `obey-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          cards: data.cards,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // If tasks were created, trigger parent refresh
        if (data.cards && data.cards.length > 0 && onTaskUpdated) {
          onTaskUpdated();
        }
      } else {
        throw new Error(data.error || "Failed to get reply");
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Sorry Femi, I hit an unexpected snag: ${err.message || "Network error"}. Please try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCard = async (taskId: string, token: string) => {
    setActionInProgress(taskId);
    try {
      const res = await fetch("/api/obey/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id: taskId, token }),
      });
      const data = await res.json();

      if (data.success) {
        // Update local card status
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            cards: msg.cards?.map((c) =>
              c.id === taskId ? { ...c, status: "executed" } : c
            ),
          }))
        );
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error("Card approve error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectCard = async (taskId: string, token: string) => {
    setActionInProgress(taskId);
    try {
      const res = await fetch("/api/obey/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", id: taskId, token }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            cards: msg.cards?.map((c) =>
              c.id === taskId ? { ...c, status: "rejected" } : c
            ),
          }))
        );
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error("Card reject error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content: "Chat cleared! How can I assist you right now, Femi?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-[650px] rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#070707] shadow-2xl overflow-hidden">
      {/* Console Top Header */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-black shadow-md shadow-emerald-500/20">
              <Bot size={22} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-black rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-zinc-950 dark:text-white tracking-tight">
                Agent Obey · AI Chat Console
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Online
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
              Autonomous assistant connected to Neon DB & Gmail SMTP
            </p>
          </div>
        </div>

        <button
          onClick={clearChat}
          title="Clear Conversation"
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-xs flex items-center gap-1 font-semibold"
        >
          <Trash2 size={15} />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {messages.map((m) => {
          const isUser = m.role === "user";

          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-black flex items-center justify-center shrink-0 mt-1 shadow-sm font-bold text-xs">
                  <Bot size={17} />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 space-y-3 ${
                  isUser
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-black font-medium text-sm shadow-md"
                    : "bg-zinc-100 dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 text-sm shadow-sm"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>

                {/* Render Embedded Action Cards (if Obey returned cards) */}
                {m.cards && m.cards.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {m.cards.map((card) => {
                      const isExecuted = card.status === "executed";
                      const isRejected = card.status === "rejected";

                      return (
                        <div
                          key={card.id}
                          className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0c] space-y-3 shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {card.badge && (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  {card.badge}
                                </span>
                              )}
                              <h5 className="font-bold text-sm text-zinc-950 dark:text-white mt-1">
                                {card.title}
                              </h5>
                              {card.subtitle && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                                  {card.subtitle}
                                </p>
                              )}
                            </div>

                            {/* Status Pills */}
                            {isExecuted && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 size={12} /> Sent via SMTP
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                                <XCircle size={12} /> Rejected
                              </span>
                            )}
                          </div>

                          {/* Card Details / Proposal Payload */}
                          {card.details && (
                            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-sans max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                              {card.details}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {/* Copy Button */}
                            {card.details && (
                              <button
                                onClick={() => copyText(card.details || "", card.id)}
                                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-[11px] flex items-center gap-1 transition-all"
                              >
                                {copiedId === card.id ? (
                                  <>
                                    <Check size={13} className="text-emerald-500" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy size={13} />
                                    Copy
                                  </>
                                )}
                              </button>
                            )}

                            {/* External Job Link */}
                            {card.link && (
                              <a
                                href={card.link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-blue-600 dark:text-blue-400 font-bold text-[11px] flex items-center gap-1 transition-all"
                              >
                                <ExternalLink size={13} />
                                Open Link
                              </a>
                            )}

                            {/* HITL Approve / Reject (Only if still pending) */}
                            {!isExecuted && !isRejected && card.approvalToken && (
                              <>
                                <button
                                  onClick={() => handleApproveCard(card.id, card.approvalToken!)}
                                  disabled={actionInProgress === card.id}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 ml-auto"
                                >
                                  <CheckCircle2 size={13} />
                                  {actionInProgress === card.id ? "Sending..." : "Approve & Send via SMTP"}
                                </button>
                                <button
                                  onClick={() => handleRejectCard(card.id, card.approvalToken!)}
                                  disabled={actionInProgress === card.id}
                                  className="px-2.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-red-500/20 text-zinc-700 dark:text-zinc-300 hover:text-red-500 font-bold text-[11px] transition-all disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  className={`text-[10px] ${
                    isUser
                      ? "text-zinc-400 dark:text-zinc-500 text-right"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-black flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Bot size={17} />
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-500">
              <RefreshCw size={13} className="animate-spin text-emerald-500" />
              <span>Obey is reasoning & accessing databases...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="px-4 py-2 bg-zinc-50/60 dark:bg-zinc-950/60 border-t border-zinc-200 dark:border-zinc-800/80 overflow-x-auto flex items-center gap-2 no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0 flex items-center gap-1">
          <Sparkles size={11} className="text-amber-500" /> Quick:
        </span>
        <button
          onClick={() => handleSend("Scout Upwork jobs for Next.js & n8n")}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black transition-all shrink-0 flex items-center gap-1"
        >
          <Briefcase size={12} className="text-blue-500" /> Scout Upwork Jobs
        </button>
        <button
          onClick={() => handleSend("Hunt real B2B decision makers in logistics")}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black transition-all shrink-0 flex items-center gap-1"
        >
          <Mail size={12} className="text-amber-500" /> Hunt B2B Leads
        </button>
        <button
          onClick={() => handleSend("What tasks are waiting for my approval?")}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black transition-all shrink-0 flex items-center gap-1"
        >
          <Clock size={12} className="text-purple-500" /> Pending Approvals
        </button>
        <button
          onClick={() => handleSend("Show me our CRM pipeline stats")}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black transition-all shrink-0 flex items-center gap-1"
        >
          <Zap size={12} className="text-emerald-500" /> Pipeline Stats
        </button>
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 sm:p-4 bg-zinc-100 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Command Obey (e.g. 'Scout Upwork jobs', 'Hunt B2B leads', 'Show stats')..."
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center shrink-0"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
