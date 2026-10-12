"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Key,
  Layers,
  ArrowRight,
  Database,
  ChevronDown,
} from "lucide-react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface ProviderSetting {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  docUrl: string;
  category: "ai" | "leads" | "automations";
  modelKey?: string;
  defaultModel?: string;
}

const PROVIDERS: ProviderSetting[] = [
  {
    id: "GEMINI_API_KEY",
    name: "Google Gemini (Primary Brain)",
    description: "Fast, generous free tier. Powers Obey's conversational reasoning and proposals.",
    placeholder: "AIzaSy... or AQ.Ab8...",
    docUrl: "https://aistudio.google.com/app/apikey",
    category: "ai",
    modelKey: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "OPENROUTER_API_KEY",
    name: "OpenRouter (Fallback 1)",
    description: "Universal AI aggregator (access Llama 3.3, Mistral, Claude, DeepSeek).",
    placeholder: "sk-or-v1-...",
    docUrl: "https://openrouter.ai/keys",
    category: "ai",
    modelKey: "OPENROUTER_MODEL",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
  },
  {
    id: "GROK_API_KEY",
    name: "xAI / Grok (Fallback 2)",
    description: "Elon Musk's Grok AI models (grok-2, grok-beta).",
    placeholder: "xai-...",
    docUrl: "https://console.x.ai/",
    category: "ai",
    modelKey: "GROK_MODEL",
    defaultModel: "grok-2-latest",
  },
  {
    id: "GROQ_API_KEY",
    name: "Groq Llama (Fallback 3)",
    description: "Ultra-fast LPUs running Llama 3.3 70B with sub-second latency.",
    placeholder: "gsk_...",
    docUrl: "https://console.groq.com/keys",
    category: "ai",
    modelKey: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "OPENAI_API_KEY",
    name: "OpenAI (Fallback 4)",
    description: "Official OpenAI access for GPT-4o and GPT-4o-mini.",
    placeholder: "sk-proj-...",
    docUrl: "https://platform.openai.com/api-keys",
    category: "ai",
    modelKey: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "APOLLO_API_KEY",
    name: "Apollo.io (Lead Hunter)",
    description: "Searches millions of live verified B2B companies & decision-maker corporate emails.",
    placeholder: "Master API key from apollo.io",
    docUrl: "https://app.apollo.io/#/settings/integrations/api_keys",
    category: "leads",
  },
  {
    id: "UPWORK_FEED_URL",
    name: "Upwork Saved Search Feed URL",
    description: "Your personal logged-in search RSS link (bypasses Cloudflare bot challenges).",
    placeholder: "https://www.upwork.com/ab/feed/jobs/rss?...",
    docUrl: "https://www.upwork.com",
    category: "automations",
  },
  {
    id: "CRM_WEBHOOK_URL",
    name: "Google Sheets / n8n CRM Webhook",
    description: "Webhook URL to auto-append approved leads into your Google Sheet or trigger WhatsApp bots.",
    placeholder: "https://script.google.com/... or https://your-n8n.com/webhook/...",
    docUrl: "https://n8n.io",
    category: "automations",
  },
];

export default function AISettingsModal({ isOpen, onClose, onSaved }: AISettingsModalProps) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [maskedInfo, setMaskedInfo] = useState<Record<string, { isSet: boolean; masked: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { testing: boolean; success?: boolean; message?: string }>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch current settings
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.settings) {
        const initialKeys: Record<string, string> = {};
        const masks: Record<string, { isSet: boolean; masked: string }> = {};

        for (const [k, v] of Object.entries(data.settings) as [string, any][]) {
          initialKeys[k] = v.value || "";
          masks[k] = { isSet: v.isSet, masked: v.masked };
        }
        setKeys(initialKeys);
        setMaskedInfo(masks);

        // Auto-fetch models for Gemini if key is set
        if (initialKeys["GEMINI_API_KEY"]) {
          fetchLiveModelsForProvider("GEMINI_API_KEY", initialKeys["GEMINI_API_KEY"]);
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const handleKeyChange = (id: string, val: string) => {
    setKeys((prev) => ({ ...prev, [id]: val }));
  };

  const fetchLiveModelsForProvider = async (providerId: string, currentKey?: string) => {
    const keyVal = currentKey || keys[providerId];
    if (!keyVal?.trim()) return;

    setFetchingModels((prev) => ({ ...prev, [providerId]: true }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_models", provider: providerId, key: keyVal }),
      });
      const data = await res.json();

      if (data.success && data.models && data.models.length > 0) {
        setAvailableModels((prev) => ({ ...prev, [providerId]: data.models }));

        // If no model was selected yet, set the first one
        const settingDef = PROVIDERS.find((p) => p.id === providerId);
        if (settingDef?.modelKey && !keys[settingDef.modelKey]) {
          setKeys((prev) => ({ ...prev, [settingDef.modelKey!]: data.models[0] }));
        }
      }
    } catch (err) {
      console.error("Model fetch error:", err);
    } finally {
      setFetchingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleTestConnection = async (providerId: string) => {
    const keyVal = keys[providerId];
    if (!keyVal?.trim()) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { testing: false, success: false, message: "Enter a key first to test." },
      }));
      return;
    }

    const settingDef = PROVIDERS.find((p) => p.id === providerId);
    const selectedModel = settingDef?.modelKey ? keys[settingDef.modelKey] || settingDef.defaultModel : undefined;

    setTestResults((prev) => ({
      ...prev,
      [providerId]: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          provider: providerId,
          key: keyVal,
          model: selectedModel,
        }),
      });
      const data = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [providerId]: { testing: false, success: data.success, message: data.message },
      }));

      // Also trigger a live models refresh if successful
      if (data.success && settingDef?.modelKey && (!availableModels[providerId] || availableModels[providerId].length === 0)) {
        fetchLiveModelsForProvider(providerId, keyVal);
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { testing: false, success: false, message: `Test failed: ${err.message}` },
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: keys }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage("✅ Keys & model selections saved to Neon PostgreSQL database!");
        if (onSaved) onSaved();
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage(`⚠️ Save error: ${data.error || "Unknown"}`);
      }
    } catch (err: any) {
      setStatusMessage(`⚠️ Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-zinc-950 dark:text-white tracking-tight">
                  AI Brain & Fallback Providers
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-black">
                  Live Model Picker
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure live models for Gemini, OpenRouter, Grok, Groq, and Apollo. Auto-switches on high load.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw size={24} className="animate-spin text-emerald-500" />
              <p className="text-sm font-semibold">Loading persistent credentials from Neon DB...</p>
            </div>
          ) : (
            <>
              {/* Category: AI Models Waterfall */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Layers size={14} /> AI LLM Waterfall (Auto-Failover in order)
                  </h4>
                  <span className="text-[11px] text-zinc-500">
                    Auto-cascades to next available model if 503 or quota limits occur
                  </span>
                </div>

                <div className="space-y-3">
                  {PROVIDERS.filter((p) => p.category === "ai").map((p) => {
                    const testState = testResults[p.id];
                    const isSet = maskedInfo[p.id]?.isSet;
                    const models = availableModels[p.id] || [];
                    const isFetching = fetchingModels[p.id];
                    const selectedModel = p.modelKey ? keys[p.modelKey] || p.defaultModel : "";

                    return (
                      <div
                        key={p.id}
                        className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-3 transition-all"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-zinc-950 dark:text-white">
                                {p.name}
                              </span>
                              {isSet && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Configured
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {p.description}
                            </p>
                          </div>

                          <a
                            href={p.docUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            Get Key <ExternalLink size={11} />
                          </a>
                        </div>

                        {/* API Key Input + Test Button */}
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={keys[p.id] || ""}
                            onChange={(e) => handleKeyChange(p.id, e.target.value)}
                            placeholder={p.placeholder}
                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />

                          <button
                            type="button"
                            onClick={() => handleTestConnection(p.id)}
                            disabled={testState?.testing}
                            className="px-3.5 py-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold shrink-0 transition-all flex items-center gap-1.5"
                          >
                            {testState?.testing ? (
                              <>
                                <RefreshCw size={13} className="animate-spin text-emerald-500" />
                                Testing...
                              </>
                            ) : (
                              "Test Connection"
                            )}
                          </button>
                        </div>

                        {/* Dynamic Real-Time Model Selector Row */}
                        {p.modelKey && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                                <Layers size={12} className="text-emerald-500" /> Model:
                              </span>

                              {models.length > 0 ? (
                                <select
                                  value={selectedModel}
                                  onChange={(e) => handleKeyChange(p.modelKey!, e.target.value)}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-white font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-[280px]"
                                >
                                  {models.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={selectedModel}
                                  onChange={(e) => handleKeyChange(p.modelKey!, e.target.value)}
                                  placeholder={p.defaultModel}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[200px]"
                                />
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => fetchLiveModelsForProvider(p.id)}
                              disabled={isFetching || !keys[p.id]?.trim()}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                              title="Fetch all live active models from provider"
                            >
                              <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
                              {isFetching ? "Fetching Live Models..." : "🔄 Fetch Live Models"}
                            </button>
                          </div>
                        )}

                        {/* Test Feedback Result */}
                        {testState && !testState.testing && testState.message && (
                          <div
                            className={`p-2.5 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                              testState.success
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-500 border border-red-500/20"
                            }`}
                          >
                            {testState.success ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                            <span>{testState.message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category: Lead Hunters & Scrapers */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Database size={14} /> Lead Scraping & Decision-Maker Hunter
                </h4>

                <div className="space-y-3">
                  {PROVIDERS.filter((p) => p.category === "leads").map((p) => {
                    const testState = testResults[p.id];
                    const isSet = maskedInfo[p.id]?.isSet;

                    return (
                      <div
                        key={p.id}
                        className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-zinc-950 dark:text-white">
                                {p.name}
                              </span>
                              {isSet && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Configured
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {p.description}
                            </p>
                          </div>

                          <a
                            href={p.docUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            Apollo Portal <ExternalLink size={11} />
                          </a>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={keys[p.id] || ""}
                            onChange={(e) => handleKeyChange(p.id, e.target.value)}
                            placeholder={p.placeholder}
                            className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                          />

                          <button
                            type="button"
                            onClick={() => handleTestConnection(p.id)}
                            disabled={testState?.testing}
                            className="px-3 py-2.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold shrink-0 transition-all flex items-center gap-1.5"
                          >
                            {testState?.testing ? (
                              <>
                                <RefreshCw size={13} className="animate-spin text-amber-500" />
                                Testing...
                              </>
                            ) : (
                              "Test Connection"
                            )}
                          </button>
                        </div>

                        {testState && !testState.testing && testState.message && (
                          <div
                            className={`p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5 ${
                              testState.success
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-500 border border-red-500/20"
                            }`}
                          >
                            {testState.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                            {testState.message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category: Ecosystem & Webhooks */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Ecosystem Connections & Webhooks
                </h4>

                <div className="space-y-3">
                  {PROVIDERS.filter((p) => p.category === "automations").map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2"
                    >
                      <div>
                        <span className="font-bold text-sm text-zinc-950 dark:text-white">
                          {p.name}
                        </span>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {p.description}
                        </p>
                      </div>

                      <input
                        type="text"
                        value={keys[p.id] || ""}
                        onChange={(e) => handleKeyChange(p.id, e.target.value)}
                        placeholder={p.placeholder}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {statusMessage && (
            <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-center">
              {statusMessage}
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-zinc-500">
            🔒 All keys & models are stored in your encrypted Neon PostgreSQL cluster.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Saving to Cloud DB...
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  Save & Apply Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
