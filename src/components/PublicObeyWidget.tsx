"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, Sparkles, User, RefreshCw, ChevronDown } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function PublicObeyWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize or restore session
  useEffect(() => {
    let sid = localStorage.getItem("obey_web_session_id");
    if (!sid) {
      sid = "session_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("obey_web_session_id", sid);
    }
    setSessionId(sid);

    const savedName = localStorage.getItem("obey_visitor_name") || "";
    const savedEmail = localStorage.getItem("obey_visitor_email") || "";
    setVisitorName(savedName);
    setVisitorEmail(savedEmail);

    const savedMsgs = localStorage.getItem("obey_web_messages");
    if (savedMsgs) {
      try {
        setMessages(JSON.parse(savedMsgs));
      } catch {}
    } else {
      // Welcome message
      const initialWelcome: Message = {
        id: "msg_welcome",
        role: "assistant",
        content: "Hey there! Welcome to Femi's space. I'm Obey, working with Femi on software engineering, AI systems, and operations. How can I help you today?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([initialWelcome]);
    }
  }, []);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("obey_web_messages", JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: Message = {
      id: "usr_" + Date.now(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/obey/web/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          visitorName,
          visitorEmail,
          message: text,
        }),
      });

      const data = await res.json();
      const assistantMsg: Message = {
        id: "asst_" + Date.now(),
        role: "assistant",
        content: data.reply || "Thanks for your message! Femi and I will review this promptly.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: "err_" + Date.now(),
          role: "assistant",
          content: "I ran into a quick connection glitch, but your message has been logged. Feel free to leave your email so we can get in touch!",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    localStorage.removeItem("obey_web_messages");
    const freshWelcome: Message = {
      id: "msg_welcome_" + Date.now(),
      role: "assistant",
      content: "Hey there! How can I help you connect with Femi today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([freshWelcome]);
  };

  const quickPills = [
    "🚀 I need a custom web application",
    "⚡ Looking for AI agents & automations",
    "📅 How can I book a call with Femi?",
  ];

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-2xl hover:scale-105 transition-all duration-200 border border-zinc-800 dark:border-zinc-200 group"
          aria-label="Chat with Obey"
        >
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-emerald-500/40 shrink-0">
            <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-zinc-950 dark:border-white" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
              Chat with Obey
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 dark:text-emerald-700 font-semibold">
                Online
              </span>
            </p>
            <p className="text-[10px] opacity-70">Femi's Executive Associate</p>
          </div>
        </button>
      )}

      {/* Expanded Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[94vw] sm:w-[400px] h-[550px] max-h-[85vh] bg-white dark:bg-[#0c0c0e] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="px-5 py-3.5 bg-zinc-950 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-2xl overflow-hidden border border-emerald-500/40 shrink-0">
                <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black tracking-tight">Obey</h3>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">
                    Chief of Staff
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Active · Replies in seconds
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-zinc-400">
              <button
                onClick={handleClearChat}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors"
                title="Restart chat"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors"
                title="Close chat"
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/50 dark:bg-[#09090b]/50 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-lg overflow-hidden border border-emerald-500/30 shrink-0 mt-0.5">
                    <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    m.role === "user"
                      ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-medium rounded-tr-xs"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-xs shadow-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <span
                    className={`block text-[9px] mt-1 opacity-50 ${
                      m.role === "user" ? "text-right text-zinc-300 dark:text-zinc-600" : "text-zinc-400"
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-6 h-6 rounded-lg overflow-hidden border border-emerald-500/30 shrink-0">
                  <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-2.5 text-zinc-500 flex items-center gap-1.5 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 bg-zinc-100/70 dark:bg-zinc-900/50 flex flex-wrap gap-1.5 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              {quickPills.map((pill, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(pill)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500 transition-colors"
                >
                  {pill}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar with Multiline on Mobile */}
          <div className="p-3 bg-white dark:bg-[#0c0c0e] border-t border-zinc-200 dark:border-zinc-800 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // On desktop: Enter sends message, Shift+Enter creates new line.
                  // On mobile touch devices: Enter naturally creates a new line without sending!
                  const isMobile =
                    typeof window !== "undefined" &&
                    ("ontouchstart" in window || navigator.maxTouchPoints > 0);
                  if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Ask Obey about projects, services, or pricing..."
                className="flex-1 max-h-24 min-h-[38px] px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-500 transition-all shrink-0 mb-0.5"
                title="Send message"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 hidden sm:block">
              Press <span className="font-mono text-zinc-500">Enter</span> to send, <span className="font-mono text-zinc-500">Shift + Enter</span> for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
