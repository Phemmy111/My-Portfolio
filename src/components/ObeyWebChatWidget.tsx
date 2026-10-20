"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, PhoneCall, Sparkles, ArrowRight, Check, Bot } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Props {
  workspaceSlug?: string;
  workspaceName?: string;
  ownerPhone?: string;
  initialGreeting?: string;
  accentColor?: string;
}

export default function ObeyWebChatWidget({
  workspaceSlug = "autolearn-spot",
  workspaceName = "AutoLearn Spot",
  ownerPhone = "2348120934828",
  initialGreeting,
  accentColor = "emerald",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session and greeting
  useEffect(() => {
    let sid = localStorage.getItem("obey_web_session_id");
    if (!sid) {
      sid = `sesh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("obey_web_session_id", sid);
    }
    setSessionId(sid);

    const greeting =
      initialGreeting ||
      `👋 Hello! Welcome to *${workspaceName}*. I am Obey, your 24/7 AI co-pilot. How can I help you today?`;

    setMessages([
      {
        id: "msg-welcome",
        role: "assistant",
        content: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }, [workspaceName, initialGreeting]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/obey/web/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          visitorName: "Web Visitor",
          message: text,
          workspaceSlug,
        }),
      });

      const data = await res.json();
      if (data.ok && data.reply) {
        const asstMsg: Message = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, asstMsg]);
      } else {
        throw new Error(data.error || "Failed to get reply");
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I had a momentary connection issue. You can continue on WhatsApp directly using the button above!",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOnWhatsApp = () => {
    const lastUserQuery = [...messages].reverse().find((m) => m.role === "user")?.content || "Hi, I'm visiting your website and would like more information.";
    const text = encodeURIComponent(`Hello ${workspaceName}! I was chatting with your AI assistant on your website:\n"${lastUserQuery}"`);
    window.open(`https://wa.me/${ownerPhone.replace(/\D/g, "")}?text=${text}`, "_blank");
  };

  const handleOpenVoiceCall = () => {
    window.open(`/call?workspace=${workspaceSlug}`, "_blank");
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans antialiased">
      {/* Floating Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[90vw] sm:w-[380px] h-[540px] max-h-[80vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-800 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900"></span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 leading-none">
                  <span>{workspaceName}</span>
                </h3>
                <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">● Active 24/7 AI Co-Pilot</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenVoiceCall}
                title="Start Voice Call"
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Omnichannel Ribbon: WhatsApp & Voice Call */}
          <div className="bg-emerald-950/30 border-b border-emerald-500/20 px-3.5 py-2 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-300 font-medium">Prefer WhatsApp?</span>
            <button
              type="button"
              onClick={handleContinueOnWhatsApp}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/30 transition"
            >
              <span>Continue on WhatsApp</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-emerald-600 text-white rounded-br-xs"
                      : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                <span className="text-[9px] text-slate-400 mt-1 px-1">{m.timestamp}</span>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-1.5 text-slate-400 text-xs py-2 px-3 bg-slate-900/60 border border-slate-800/80 rounded-xl w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Obey is typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3 py-1.5 bg-slate-900/40 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto text-[10px]">
            <button
              type="button"
              onClick={() => handleSend("What courses and skills do you teach?")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              📚 Course Catalog
            </button>
            <button
              type="button"
              onClick={() => handleSend("How much is enrollment and pricing?")}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              💰 Pricing
            </button>
            <button
              type="button"
              onClick={handleContinueOnWhatsApp}
              className="whitespace-nowrap px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 transition"
            >
              💬 WhatsApp
            </button>
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold transition flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>
      )}

      {/* Launcher Bubble */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-slate-950" />
        ) : (
          <MessageSquare className="w-6 h-6 text-slate-950" />
        )}
        {!isOpen && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-300 border-2 border-slate-950 rounded-full animate-pulse"></span>
        )}
      </button>
    </div>
  );
}
