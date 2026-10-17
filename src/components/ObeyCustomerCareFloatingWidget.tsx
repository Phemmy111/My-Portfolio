"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Send,
  X,
  Sparkles,
  RefreshCw,
  Trash2,
  Minimize2,
  Maximize2,
  ExternalLink,
  ShieldCheck,
  PhoneCall,
  Check,
  Copy,
  ChevronRight,
  Bot,
  MessageSquare,
} from "lucide-react";
import { formatToWAT } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  imageUrl?: string;
}

const STORAGE_KEY = "obey_customer_care_chat_v1";
const SESSION_KEY = "obey_customer_care_session_id";

const QUICK_PROMPTS = [
  "🚀 How does the 7-day free trial work?",
  "📱 How does Obey auto-save WhatsApp contacts?",
  "💰 What are the live subscription pricing plans?",
  "🎙️ How does the 100% free voice hotline work?",
  "⚡ How do I connect my WhatsApp with a pairing code?",
];

function FormattedContent({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");

  const formatInline = (str: string): React.ReactNode => {
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    const parts = str.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Inline code
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return (
          <code
            key={index}
            className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-semibold"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      // Bold **text**
      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        return (
          <strong key={index} className="font-extrabold text-zinc-950 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Italic *text*
      if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        return (
          <em key={index} className="italic text-zinc-800 dark:text-zinc-200">
            {part.slice(1, -1)}
          </em>
        );
      }

      // Markdown Link [text](url)
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 dark:text-emerald-400 underline font-bold hover:text-emerald-500 inline-flex items-center gap-0.5"
          >
            <span>{linkMatch[1]}</span>
            <ExternalLink className="w-3 h-3 inline" />
          </a>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-1.5 leading-relaxed text-xs sm:text-sm">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />;
        const isBullet = line.trim().startsWith("• ") || line.trim().startsWith("- ");
        const cleanLine = isBullet ? line.trim().replace(/^[•-]\s*/, "") : line;

        return (
          <div key={idx} className={isBullet ? "flex items-start gap-1.5 pl-1" : ""}>
            {isBullet && <span className="text-emerald-500 font-bold">•</span>}
            <div className="flex-1">{formatInline(cleanLine)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ObeyCustomerCareFloatingWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Initialize sessionId & Load Chat History
  useEffect(() => {
    let sid = "";
    try {
      sid = localStorage.getItem(SESSION_KEY) || "";
      if (!sid) {
        sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(SESSION_KEY, sid);
      }
      setSessionId(sid);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}

    // Default Customer Care greeting
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hello! 👋 Welcome to **Obey Business**.\n\nI'm **Obey**, your 24/7 AI Customer Care, Onboarding & Sales Concierge. How can I help your business grow and automate customer operations today?",
        timestamp: formatToWAT(new Date()),
      },
    ]);
  }, []);

  // Save messages to LocalStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch {}
    }
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: formatToWAT(new Date()),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/obey/web/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || "web-visitor-guest",
          visitorName: "Website Guest",
          message: text,
        }),
      });

      const data = await res.json();
      if (data && data.reply) {
        const asstMsg: ChatMessage = {
          id: `asst_${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: formatToWAT(new Date()),
          imageUrl: data.imageUrl,
        };
        setMessages((prev) => [...prev, asstMsg]);
      } else {
        throw new Error(data?.error || "Empty reply");
      }
    } catch (err: any) {
      console.error("[Customer Care Chat Error]:", err);
      const fallbackMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content:
          "I'm right here with you! If you need immediate assistance or want to talk live with Femi Adeleke or Main Obey, you can reach out directly on WhatsApp at [Chat with Main Obey](https://wa.me/2349161488564) (+2349161488564).",
        timestamp: formatToWAT(new Date()),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    const welcome: ChatMessage = {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! 👋 Welcome back to **Obey Business**.\n\nI'm **Obey**, your 24/7 AI Customer Care specialist. How can I assist you right now?",
      timestamp: formatToWAT(new Date()),
    };
    setMessages([welcome]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([welcome]));
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // On mobile / touch screens (< 768px or touch device), Enter key should insert a new line, not send
      const isMobileDevice =
        typeof window !== "undefined" &&
        (window.innerWidth < 768 ||
          "ontouchstart" in window ||
          (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0));

      if (!isMobileDevice) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  return (
    <>
      {/* Floating Trigger Pill */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900 dark:bg-[#071322] text-white border border-emerald-500/50 shadow-2xl hover:border-emerald-400 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="Open Obey Customer Care Live Chat"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-emerald-500/60 shadow-md shadow-emerald-500/30 bg-zinc-900">
                <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
            </div>

            <div className="text-left hidden xs:block sm:block">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black tracking-tight text-white flex items-center gap-1">
                  Chat with Obey
                </p>
                <span className="obey-care-badge px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500 text-slate-950 shadow-xs">
                  Care 24/7
                </span>
              </div>
              <p className="text-[10px] text-emerald-400 font-semibold leading-none mt-0.5">
                Customer Care & Sales
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Floating Customer Care Drawer / Window */}
      {isOpen && (
        <div className="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-6 sm:right-6 z-[100] w-auto sm:w-[410px] md:w-[430px] h-[86vh] sm:h-[600px] max-h-[720px] bg-white dark:bg-[#09111e] border border-zinc-200 dark:border-emerald-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 dark:bg-[#060c16] text-white flex items-center justify-between border-b border-slate-800 dark:border-emerald-500/20 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-emerald-500/50 shadow-sm bg-zinc-900">
                  <img src="/obey-logo.jpg" alt="Obey Customer Care" className="w-full h-full object-cover" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-xs sm:text-sm text-white flex items-center gap-1">
                    Obey Customer Care
                  </h3>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  Online • 24/7 Live Support & Sales
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-300">
              <button
                onClick={handleClearChat}
                className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Notice Banner */}
          <div className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200/50 dark:border-emerald-500/10 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
            <span className="flex items-center gap-1 font-semibold truncate">
              <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Ask anything about Obey Business, pricing, or WhatsApp auto-saving!</span>
            </span>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50 dark:bg-[#070e1a]/60">
            {messages.map((m) => {
              const isAssistant = m.role === "assistant";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                >
                  <div className="flex items-end gap-1.5 max-w-[88%]">
                    {isAssistant && (
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-emerald-500/40 shrink-0 mb-1 bg-zinc-900">
                        <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl ${
                        isAssistant
                          ? "bg-white dark:bg-[#0f192b] text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-slate-800 shadow-xs rounded-bl-sm"
                          : "bg-emerald-600 text-white shadow-xs rounded-br-sm"
                      }`}
                    >
                      <FormattedContent text={m.content} />
                      {m.imageUrl && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                          <img src={m.imageUrl} alt="Artwork" className="w-full h-auto object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1 px-1">
                    {m.timestamp}
                  </span>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {loading && (
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs py-1">
                <div className="w-6 h-6 rounded-full overflow-hidden border border-emerald-500/40 shrink-0 bg-zinc-900">
                  <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                </div>
                <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-[#0f192b] border border-zinc-200/80 dark:border-slate-800 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-medium ml-1 text-zinc-500 dark:text-zinc-400">
                    Obey is thinking...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-[#08101d] border-t border-slate-200 dark:border-slate-800/80 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt.replace(/^[^\s]+\s*/, ""))}
                disabled={loading}
                className="shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-slate-800 dark:text-slate-100 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-300 dark:border-slate-700 hover:border-emerald-500/40 transition cursor-pointer shadow-xs"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white dark:bg-[#09111e] border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-1.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2 bg-slate-50 dark:bg-[#0c1626] border border-slate-300 dark:border-slate-700/80 focus-within:border-emerald-500 dark:focus-within:border-emerald-500 rounded-xl px-3 py-1.5 transition"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Obey anything about the platform..."
                className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none max-h-24 leading-normal"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:hover:bg-emerald-600 transition shrink-0 cursor-pointer"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1">
              <span>⚡ Obey Business 2.0 • Customer Care</span>
              <Link
                href="/control-room"
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
              >
                Claim 7-Day Trial →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
