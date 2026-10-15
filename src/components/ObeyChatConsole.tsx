"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
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
  Trash2,
  X,
  Maximize2,
  Minimize2,
  FileText,
  PhoneCall,
  Paperclip,
} from "lucide-react";
import { formatToWAT } from "@/lib/utils";

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
  onClose?: () => void;
  isFloating?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const CHAT_STORAGE_KEY = "femi_obey_chat_history_v2";

/**
 * Cleanly renders Markdown text without raw asterisks (*, **),
 * styling bold, italics, inline code, links, and bullet lists cleanly.
 */
function FormattedMessage({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");

  const formatInline = (str: string): React.ReactNode => {
    // Regex matches inline code `code`, bold **text**, italic *text*, and markdown [links](url)
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    const parts = str.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Inline code
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        return (
          <code
            key={index}
            className="px-1.5 py-0.5 rounded bg-zinc-200/90 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-semibold"
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
          <em key={index} className="italic text-zinc-700 dark:text-zinc-300">
            {part.slice(1, -1)}
          </em>
        );
      }

      // Link [text](url)
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 dark:text-emerald-400 underline font-semibold hover:text-emerald-500"
          >
            {linkMatch[1]}
          </a>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2 leading-relaxed text-sm">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headers
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-black text-sm text-zinc-950 dark:text-white mt-2">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-black text-base text-zinc-950 dark:text-white mt-2">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }

        // Bullet lists
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <div className="flex-1">{formatInline(trimmed.slice(2))}</div>
            </div>
          );
        }

        // Numbered lists
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="font-bold text-xs text-emerald-500 mt-0.5 shrink-0">
                {numMatch[1]}.
              </span>
              <div className="flex-1">{formatInline(numMatch[2])}</div>
            </div>
          );
        }

        return <p key={idx}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

function getInitialGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Good morning, sir! Ready to conquer today?\n\nI'm **Obey**, your personal AI assistant. How can I help you today, sir? What are the key tasks or notes we need to tackle together?";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon, sir! How is today's work going?\n\nI'm **Obey**, your personal AI assistant. Everything in our operations is steady. How can I help you right now, sir? Are there any specific things we need to note down or work on?";
  } else {
    return "Good evening, sir! How was today's work? I hope everything went smoothly.\n\nI'm **Obey**, your personal AI assistant. Everything in our operations is running well. How can I help you tonight, sir? What are the things on your plate that we need to note down or plan for?";
  }
}

export default function ObeyChatConsole({
  onTaskUpdated,
  onClose,
  isFloating,
  isFullscreen: externalFullscreen,
  onToggleFullscreen,
}: ObeyChatConsoleProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const [attachment, setAttachment] = useState<{
    name: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(",")[1];
      setAttachment({
        name: file.name,
        base64,
        mimeType: file.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(file);
  };

  const isExpanded = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Load chat history from localStorage and sync with Neon cloud DB
  useEffect(() => {
    let localFound = false;
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          localFound = true;
        }
      }
    } catch (e) {
      console.warn("Failed to load Obey chat history:", e);
    }

    if (!localFound) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: getInitialGreeting(),
          timestamp: formatToWAT(new Date()),
        },
      ]);
    }
    setIsLoaded(true);

    // Fetch cloud-synced messages from Neon PostgreSQL database
    fetch("/api/obey/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
          try {
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(data.messages));
          } catch {}
        }
      })
      .catch((err) => console.warn("Failed to sync Obey cloud chat:", err));
  }, []);

  // 2. Persist chat history to localStorage whenever messages change
  useEffect(() => {
    if (!isLoaded || messages.length === 0) return;
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to save Obey chat history:", e);
    }
  }, [messages, isLoaded]);

  // 3. Scroll to bottom on updates
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // 4. Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        if (onToggleFullscreen) {
          onToggleFullscreen();
        } else {
          setInternalFullscreen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onToggleFullscreen]);

  const toggleFullscreen = () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else {
      setInternalFullscreen(!internalFullscreen);
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if ((!textToSend.trim() && !attachment) || loading) return;

    const currentAttachment = attachment;
    setAttachment(null);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend.trim() + (currentAttachment ? `\n📎 [Attachment: ${currentAttachment.name}]` : ""),
      timestamp: formatToWAT(new Date()),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customText) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
    setLoading(true);

    try {
      const res = await fetch("/api/obey/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend.trim() || (currentAttachment ? `Attached file: ${currentAttachment.name}` : ""),
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          mediaBase64: currentAttachment?.base64,
          mediaMimeType: currentAttachment?.mimeType,
        }),
      });

      const data = await res.json();

      if (data.reply) {
        const assistantMessage: Message = {
          id: `obey-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: formatToWAT(new Date()),
          cards: data.cards,
        };
        setMessages((prev) => [...prev, assistantMessage]);

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
          content: `⚠️ My apologies, sir. I hit a temporary network snag: ${err.message || "Request timed out"}. Please try sending that again.`,
          timestamp: formatToWAT(new Date()),
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

  const clearChat = async () => {
    const fresh: Message[] = [
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: `Conversation refreshed, sir! How can I help you right now? What are the key things we need to note down or tackle together?`,
        timestamp: formatToWAT(new Date()),
      },
    ];
    setMessages(fresh);
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {}

    // Clear cloud chat history on Neon DB
    try {
      await fetch("/api/obey/chat", { method: "DELETE" });
    } catch (e) {
      console.warn("Failed to clear cloud chat history on Neon DB:", e);
    }
  };

  const consoleContent = (
    <div
      className={`flex flex-col w-full h-full rounded-none sm:rounded-2xl md:rounded-3xl border-0 sm:border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#070707] shadow-2xl overflow-hidden ${
        isExpanded ? "sm:max-w-6xl sm:max-h-[94vh]" : ""
      }`}
    >
      {/* Console Top Header */}
      <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl overflow-hidden border border-emerald-500/50 shadow-md shadow-emerald-500/20">
              <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-black rounded-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="font-black text-xs sm:text-sm text-zinc-950 dark:text-white tracking-tight truncate">
                Agent Obey
              </h3>
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                Online
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate">
              Personal AI · Neon DB Cloud Synced
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 ml-1 sm:ml-2">
          {/* Live Voice Call Button */}
          <Link
            href="/call"
            target="_blank"
            title="Start Live Voice Call with Obey (WebRTC)"
            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all text-xs flex items-center gap-1.5 font-bold shrink-0"
          >
            <PhoneCall size={13} className="text-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">Voice Call</span>
          </Link>

          {/* Fullscreen Enlarge Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isExpanded ? "Exit Fullscreen (Esc)" : "Enlarge to Fullscreen"}
            className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-xs flex items-center gap-1 font-semibold"
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span className="hidden sm:inline">{isExpanded ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>

          {/* Clear Chat Button */}
          <button
            onClick={clearChat}
            title="Clear Conversation"
            className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-xs flex items-center gap-1 font-semibold"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Chat"
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all ml-0.5 sm:ml-1"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((m) => {
          const isUser = m.role === "user";

          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl overflow-hidden border border-emerald-500/40 shrink-0 mt-1 shadow-sm">
                  <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 space-y-3 ${
                  isUser
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-black font-medium text-sm shadow-md"
                    : "bg-zinc-100 dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 text-sm shadow-sm"
                }`}
              >
                {/* Clean Markdown Rendering without raw asterisks */}
                <FormattedMessage text={m.content} />

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
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold text-[11px] flex items-center gap-1 transition-all"
                              >
                                View Listing <ExternalLink size={12} />
                              </a>
                            )}

                            {/* Approve / Reject Buttons */}
                            {card.approvalToken && !isExecuted && !isRejected && (
                              <>
                                <button
                                  onClick={() => handleApproveCard(card.id, card.approvalToken!)}
                                  disabled={actionInProgress === card.id}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] flex items-center gap-1 transition-all disabled:opacity-50"
                                >
                                  {actionInProgress === card.id ? (
                                    <RefreshCw size={12} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={13} />
                                  )}
                                  Authorize & Dispatch
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
              <span>Obey is thinking and preparing your response, sir...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="px-3 py-2 bg-zinc-50/90 dark:bg-zinc-950/90 border-t border-zinc-200 dark:border-zinc-800/80 overflow-x-auto flex items-center gap-2 no-scrollbar shrink-0">
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
          onClick={() => handleSend("What are the things we need to note down today?")}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black transition-all shrink-0 flex items-center gap-1"
        >
          <FileText size={12} className="text-emerald-500" /> What to Note
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
          <Zap size={12} className="text-amber-500" /> Pipeline Stats
        </button>
        <Link
          href="/call"
          target="_blank"
          className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black transition-all shrink-0 flex items-center gap-1.5"
        >
          <PhoneCall size={12} className="text-emerald-500" /> Live Voice Call
        </Link>
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-2.5 sm:p-3 bg-zinc-100 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2 shrink-0"
      >
        {attachment && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 w-fit">
            <Paperclip size={13} />
            <span className="truncate max-w-[200px]">{attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="p-0.5 rounded hover:bg-emerald-500/20 ml-1 text-zinc-400 hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Image or Document"
            className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-all shrink-0 mb-0.5 shadow-xs"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Talk to Obey (e.g. 'Good afternoon sir', 'Scout Upwork jobs', 'What to note?')... [Shift+Enter for newline]"
            disabled={loading}
            rows={1}
            className="flex-1 px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none max-h-36 min-h-[46px] overflow-y-auto leading-relaxed"
          />

          <button
            type="submit"
            disabled={(!input.trim() && !attachment) || loading}
            className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center shrink-0 mb-0.5"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </div>
  );

  // If expanded in standalone / tab mode without parent fullscreen handling
  if (isExpanded && externalFullscreen === undefined) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md p-0 sm:p-4 md:p-6 flex items-center justify-center animate-in fade-in duration-200">
        {consoleContent}
      </div>
    );
  }

  return (
    <div
      className={`w-full ${
        isExpanded
          ? "h-full"
          : isFloating
          ? "h-[100dvh] sm:h-[620px] sm:max-h-[calc(100vh-100px)]"
          : "h-[620px]"
      }`}
    >
      {consoleContent}
    </div>
  );
}
