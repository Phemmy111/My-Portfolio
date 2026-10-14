"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Search,
  Send,
  Phone,
  Globe,
  SendHorizonal,
  RefreshCw,
  Download,
  CheckCircle2,
  Clock,
  User,
  Bot,
  Filter,
} from "lucide-react";

interface InboxThread {
  contact_id: string;
  sender_name: string | null;
  channel: "whatsapp" | "telegram" | "web";
  total_messages: number;
  last_message_at: string;
  last_message: string;
  last_role: "user" | "assistant";
}

interface ThreadMessage {
  id: string;
  phone_number: string;
  sender_name: string | null;
  channel: "whatsapp" | "telegram" | "web";
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export default function AdminOmnichannelInbox() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "telegram" | "web">("all");
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch threads list
  const fetchThreads = async () => {
    try {
      const res = await fetch("/api/admin/inbox");
      const data = await res.json();
      if (data.ok && Array.isArray(data.threads)) {
        setThreads(data.threads);
        // Default select first thread if none selected
        if (!selectedContactId && data.threads.length > 0) {
          setSelectedContactId(data.threads[0].contact_id);
        }
      }
    } catch (err) {
      console.error("Error fetching inbox threads:", err);
    } finally {
      setLoadingThreads(false);
    }
  };

  // Fetch messages for selected thread
  const fetchMessages = async (contactId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/inbox?contactId=${encodeURIComponent(contactId)}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Error fetching thread messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    const interval = setInterval(fetchThreads, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedContactId) {
      fetchMessages(selectedContactId);
    }
  }, [selectedContactId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingMessages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedContactId || sendingReply) return;

    const currentThread = threads.find((t) => t.contact_id === selectedContactId);
    const channel = currentThread?.channel || "whatsapp";

    setSendingReply(true);
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContactId,
          channel,
          message: replyText.trim(),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setReplyText("");
        // Optimistically add to messages
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        } else {
          fetchMessages(selectedContactId);
        }
      }
    } catch (err) {
      console.error("Error sending direct reply:", err);
    } finally {
      setSendingReply(false);
    }
  };

  // Filtered threads
  const filteredThreads = threads.filter((t) => {
    const matchesChannel = channelFilter === "all" || t.channel === channelFilter;
    const matchesSearch =
      t.contact_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.sender_name && t.sender_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.last_message && t.last_message.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesChannel && matchesSearch;
  });

  const selectedThread = threads.find((t) => t.contact_id === selectedContactId);

  const getChannelBadge = (ch: string) => {
    switch (ch) {
      case "whatsapp":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Phone size={10} /> WhatsApp
          </span>
        );
      case "telegram":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <SendHorizonal size={10} /> Telegram
          </span>
        );
      case "web":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Globe size={10} /> Web Chat
          </span>
        );
    }
  };

  return (
    <div className="h-[750px] max-h-[82vh] bg-white dark:bg-[#080808] border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col md:flex-row overflow-hidden">
      {/* LEFT COLUMN: Contacts Thread List */}
      <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 bg-zinc-50/50 dark:bg-[#0c0c0e]/50">
        {/* Search & Actions Bar */}
        <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={17} className="text-emerald-600" />
              <h3 className="font-black text-sm text-zinc-950 dark:text-white">Omnichannel Inbox</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {threads.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/api/obey/conversations?format=csv"
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Export all conversations as CSV"
              >
                <Download size={14} />
              </a>
              <button
                onClick={fetchThreads}
                className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Refresh conversations"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contact, phone, or text..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Channel Filters */}
          <div className="flex items-center gap-1">
            {(["all", "whatsapp", "telegram", "web"] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all ${
                  channelFilter === ch
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Thread Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
          {loadingThreads ? (
            <div className="p-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-emerald-500" /> Loading chats...
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No conversations found for this filter.
            </div>
          ) : (
            filteredThreads.map((t) => {
              const isSelected = t.contact_id === selectedContactId;
              const formattedTime = new Date(t.last_message_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <button
                  key={t.contact_id}
                  onClick={() => setSelectedContactId(t.contact_id)}
                  className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-l-4 border-emerald-500"
                      : "hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs text-zinc-900 dark:text-white truncate max-w-[170px]">
                      {t.sender_name || (t.contact_id.startsWith("web-") ? "Web Visitor" : `+${t.contact_id}`)}
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0">{formattedTime}</span>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1 leading-snug">
                    {t.last_role === "assistant" ? "Obey: " : ""}{t.last_message}
                  </p>

                  <div className="flex items-center justify-between w-full pt-0.5">
                    {getChannelBadge(t.channel)}
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {t.total_messages} msg{t.total_messages > 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Active Conversation & Manual Takeover */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#080808]">
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-[#0c0c0e]/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold">
                  <User size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-zinc-950 dark:text-white">
                      {selectedThread.sender_name || `+${selectedThread.contact_id}`}
                    </h4>
                    {getChannelBadge(selectedThread.channel)}
                  </div>
                  <p className="text-[11px] font-mono text-zinc-500">
                    ID: {selectedThread.contact_id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500 hidden sm:inline">
                  {messages.length} messages in history
                </span>
                <button
                  onClick={() => fetchMessages(selectedThread.contact_id)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                  title="Reload thread"
                >
                  <RefreshCw size={14} className={loadingMessages ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Message Bubble Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/30 dark:bg-[#080808]">
              {loadingMessages ? (
                <div className="p-8 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-emerald-500" /> Loading conversation...
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No messages recorded in this thread yet.
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.role === "user";
                  const time = new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={m.id}
                      className={`flex gap-2.5 ${isUser ? "justify-start" : "justify-end"}`}
                    >
                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          <User size={14} />
                        </div>
                      )}

                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 leading-relaxed text-xs shadow-xs ${
                          isUser
                            ? "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-xs"
                            : "bg-emerald-600 text-white font-medium rounded-tr-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={`text-[10px] font-bold ${isUser ? "text-zinc-500" : "text-emerald-200"}`}>
                            {isUser ? (m.sender_name || "Contact") : "Obey / Femi"}
                          </span>
                          <span className={`text-[9px] ${isUser ? "text-zinc-400" : "text-emerald-200 opacity-80"}`}>
                            {time}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>

                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold border border-emerald-500/30">
                          <Bot size={14} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Manual Takeover Reply Input Bar */}
            <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e]/50 shrink-0">
              <form onSubmit={handleSendReply} className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Send direct manual reply to ${selectedThread.sender_name || selectedThread.contact_id}...`}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5 transition-all shrink-0"
                >
                  <Send size={13} />
                  <span>Send Direct</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
            <MessageSquare size={36} className="text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Select a conversation</p>
            <p className="text-xs text-zinc-500 mt-1">
              Choose a contact from the left panel to inspect messages and reply directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
