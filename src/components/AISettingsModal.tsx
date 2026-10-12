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
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { AIProviderConfig } from "@/lib/settings";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const PROVIDER_OPTIONS: Array<{
  id: "gemini" | "openrouter" | "grok" | "groq" | "openai";
  name: string;
  defaultModel: string;
  docUrl: string;
}> = [
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    docUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    docUrl: "https://openrouter.ai/keys",
  },
  {
    id: "grok",
    name: "xAI / Grok",
    defaultModel: "grok-2-latest",
    docUrl: "https://console.x.ai/",
  },
  {
    id: "groq",
    name: "Groq Llama",
    defaultModel: "llama-3.3-70b-versatile",
    docUrl: "https://console.groq.com/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    docUrl: "https://platform.openai.com/api-keys",
  },
];

export default function AISettingsModal({ isOpen, onClose, onSaved }: AISettingsModalProps) {
  const [providersPool, setProvidersPool] = useState<AIProviderConfig[]>([]);
  const [generalKeys, setGeneralKeys] = useState<Record<string, string>>({
    APOLLO_API_KEY: "",
    UPWORK_FEED_URL: "",
    CRM_WEBHOOK_URL: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { testing: boolean; success?: boolean; message?: string }>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch current settings & pool
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();

      if (data.pool && Array.isArray(data.pool)) {
        setProvidersPool(data.pool);

        // Auto-fetch models for first Gemini provider if it has a key
        const firstGemini = data.pool.find((p: AIProviderConfig) => p.provider === "gemini" && p.apiKey);
        if (firstGemini) {
          fetchLiveModelsForProvider(firstGemini.id, firstGemini.provider, firstGemini.apiKey);
        }
      }

      if (data.settings) {
        setGeneralKeys({
          APOLLO_API_KEY: data.settings.APOLLO_API_KEY?.value || "",
          UPWORK_FEED_URL: data.settings.UPWORK_FEED_URL?.value || "",
          CRM_WEBHOOK_URL: data.settings.CRM_WEBHOOK_URL?.value || "",
        });
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

  // Pool management
  const handleAddProvider = (providerType: "gemini" | "openrouter" | "grok" | "groq" | "openai" = "gemini") => {
    const option = PROVIDER_OPTIONS.find((o) => o.id === providerType) || PROVIDER_OPTIONS[0];
    const count = providersPool.filter((p) => p.provider === providerType).length + 1;
    const newEntry: AIProviderConfig = {
      id: `${providerType}-${Date.now()}`,
      provider: providerType,
      name: `${option.name} #${count}`,
      apiKey: "",
      model: option.defaultModel,
      enabled: true,
    };
    setProvidersPool((prev) => [...prev, newEntry]);
  };

  const handleUpdateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
    setProvidersPool((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const handleRemoveProvider = (id: string) => {
    setProvidersPool((prev) => prev.filter((p) => p.id !== id));
  };

  const handleMoveProvider = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= providersPool.length) return;

    const copy = [...providersPool];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setProvidersPool(copy);
  };

  // Model discovery
  const fetchLiveModelsForProvider = async (entryId: string, provider: string, apiKey: string) => {
    if (!apiKey?.trim()) return;

    setFetchingModels((prev) => ({ ...prev, [entryId]: true }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_models", provider, key: apiKey.trim() }),
      });
      const data = await res.json();

      if (data.success && data.models && data.models.length > 0) {
        setAvailableModels((prev) => ({ ...prev, [entryId]: data.models }));

        // If current model not in list or blank, select the first
        const item = providersPool.find((p) => p.id === entryId);
        if (item && (!item.model || !data.models.includes(item.model))) {
          handleUpdateProvider(entryId, { model: data.models[0] });
        }
      }
    } catch (err) {
      console.error("Model fetch error:", err);
    } finally {
      setFetchingModels((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  // Test provider connection
  const handleTestConnection = async (entryId: string, provider: string, apiKey: string, model?: string) => {
    if (!apiKey?.trim()) {
      setTestResults((prev) => ({
        ...prev,
        [entryId]: { testing: false, success: false, message: "Enter an API key first." },
      }));
      return;
    }

    setTestResults((prev) => ({
      ...prev,
      [entryId]: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          provider,
          key: apiKey.trim(),
          model,
        }),
      });
      const data = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [entryId]: { testing: false, success: data.success, message: data.message },
      }));

      // If success and models not loaded yet, fetch them
      if (data.success && (!availableModels[entryId] || availableModels[entryId].length === 0)) {
        fetchLiveModelsForProvider(entryId, provider, apiKey);
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [entryId]: { testing: false, success: false, message: `Test failed: ${err.message}` },
      }));
    }
  };

  // Save all settings & pool
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      // 1. Save Pool
      const poolRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_pool", pool: providersPool }),
      });

      // 2. Save General Settings
      const genRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: generalKeys }),
      });

      const poolData = await poolRes.json();
      const genData = await genRes.json();

      if (poolData.success && genData.success) {
        setStatusMessage("✅ Multi-key provider pool and credentials saved to Neon DB!");
        if (onSaved) onSaved();
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage("⚠️ Failed to save some settings. Verify cloud database connection.");
      }
    } catch (err: any) {
      setStatusMessage(`⚠️ Save error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-zinc-950 dark:text-white tracking-tight">
                  AI Brain · Multi-Key Waterfall Pool
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-black">
                  Dynamic Multi-Key
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Add multiple keys for Gemini, Grok, OpenRouter, etc. Auto-switches from Key 1 → Key 2 if limits hit.
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
        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw size={24} className="animate-spin text-emerald-500" />
              <p className="text-sm font-semibold">Loading multi-key pool from Neon DB...</p>
            </div>
          ) : (
            <>
              {/* SECTION 1: Multi-Key Provider Pool */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Layers size={14} /> Active Provider Fallback Chain (Executed Top-To-Bottom)
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      If Key #1 hits rate limits, Obey automatically tries Key #2, then #3, with zero downtime.
                    </p>
                  </div>

                  {/* Add Provider Dropdown / Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddProvider("gemini")}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1 shadow-sm transition-all"
                      title="Add another Gemini account or key"
                    >
                      <Plus size={13} /> Add Gemini Key
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddProvider("grok")}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center gap-1 transition-all"
                    >
                      <Plus size={13} /> Add Grok
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddProvider("openrouter")}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center gap-1 transition-all"
                    >
                      <Plus size={13} /> Add OpenRouter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddProvider("groq")}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center gap-1 transition-all"
                    >
                      <Plus size={13} /> Add Groq
                    </button>
                  </div>
                </div>

                {/* Pool Cards */}
                <div className="space-y-3">
                  {providersPool.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                      <p className="text-xs text-zinc-500 font-semibold">No AI keys added yet.</p>
                      <button
                        type="button"
                        onClick={() => handleAddProvider("gemini")}
                        className="mt-2 text-xs text-emerald-500 font-bold underline"
                      >
                        Add your first Gemini key
                      </button>
                    </div>
                  ) : (
                    providersPool.map((item, index) => {
                      const testState = testResults[item.id];
                      const models = availableModels[item.id] || [];
                      const isFetching = fetchingModels[item.id];
                      const provDef = PROVIDER_OPTIONS.find((o) => o.id === item.provider);

                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            item.enabled
                              ? "border-zinc-300 dark:border-zinc-800 bg-zinc-50/70 dark:bg-[#0c0c0e]"
                              : "border-zinc-200 dark:border-zinc-900 bg-zinc-100/40 dark:bg-zinc-950/40 opacity-60"
                          } space-y-3 shadow-xs`}
                        >
                          {/* Card Top: Order, Name, Provider, Controls */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800/80 pb-2.5">
                            <div className="flex items-center gap-2">
                              {/* Priority index badge */}
                              <span className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-black text-xs flex items-center justify-center">
                                #{index + 1}
                              </span>

                              {/* Re-order arrows */}
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  onClick={() => handleMoveProvider(index, "up")}
                                  disabled={index === 0}
                                  className="text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 leading-none"
                                  title="Move Up in Priority"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveProvider(index, "down")}
                                  disabled={index === providersPool.length - 1}
                                  className="text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 leading-none"
                                  title="Move Down in Priority"
                                >
                                  <ArrowDown size={12} />
                                </button>
                              </div>

                              {/* Provider Type Selector */}
                              <select
                                value={item.provider}
                                onChange={(e) => {
                                  const newType = e.target.value as any;
                                  const opt = PROVIDER_OPTIONS.find((o) => o.id === newType);
                                  handleUpdateProvider(item.id, {
                                    provider: newType,
                                    model: opt?.defaultModel || "",
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider"
                              >
                                {PROVIDER_OPTIONS.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>

                              {/* Editable Nickname */}
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateProvider(item.id, { name: e.target.value })}
                                placeholder="Label (e.g. Account 2)"
                                className="px-2.5 py-1 rounded-lg bg-transparent border-b border-dashed border-zinc-400 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 max-w-[160px]"
                              />
                            </div>

                            {/* Enable/Disable + Delete */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateProvider(item.id, { enabled: !item.enabled })}
                                className="text-xs font-semibold flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all"
                                title={item.enabled ? "Disable this key" : "Enable this key"}
                              >
                                {item.enabled ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                    <ToggleRight size={18} /> Active
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 font-semibold flex items-center gap-1">
                                    <ToggleLeft size={18} /> Paused
                                  </span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveProvider(item.id)}
                                className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                title="Remove this key from pool"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Key Input & Test */}
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={item.apiKey}
                              onChange={(e) => handleUpdateProvider(item.id, { apiKey: e.target.value })}
                              placeholder={`Paste ${provDef?.name || item.provider} API Key...`}
                              className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />

                            <button
                              type="button"
                              onClick={() => handleTestConnection(item.id, item.provider, item.apiKey, item.model)}
                              disabled={testState?.testing}
                              className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold shrink-0 transition-all flex items-center gap-1.5"
                            >
                              {testState?.testing ? (
                                <>
                                  <RefreshCw size={12} className="animate-spin text-emerald-500" />
                                  Testing...
                                </>
                              ) : (
                                "Test Key"
                              )}
                            </button>
                          </div>

                          {/* Model Picker & Live Fetch */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                                <Layers size={12} className="text-emerald-500" /> Model:
                              </span>

                              {models.length > 0 ? (
                                <select
                                  value={item.model}
                                  onChange={(e) => handleUpdateProvider(item.id, { model: e.target.value })}
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
                                  value={item.model}
                                  onChange={(e) => handleUpdateProvider(item.id, { model: e.target.value })}
                                  placeholder={provDef?.defaultModel}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[200px]"
                                />
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => fetchLiveModelsForProvider(item.id, item.provider, item.apiKey)}
                              disabled={isFetching || !item.apiKey?.trim()}
                              className="px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                              title="Fetch real-time available models from this API key"
                            >
                              <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
                              {isFetching ? "Fetching..." : "🔄 Fetch Live Models"}
                            </button>
                          </div>

                          {/* Test Feedback */}
                          {testState && !testState.testing && testState.message && (
                            <div
                              className={`p-2 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                                testState.success
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-red-500/10 text-red-500 border border-red-500/20"
                              }`}
                            >
                              {testState.success ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertCircle size={13} className="shrink-0" />}
                              <span>{testState.message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECTION 2: Lead Scraper (Apollo) & Automation Ecosystem */}
              <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Database size={14} /> Apollo.io & Workflow Automation
                </h4>

                <div className="space-y-3">
                  {/* Apollo */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-950 dark:text-white">Apollo.io API Key (B2B Lead Hunter)</span>
                      <a href="https://app.apollo.io/#/settings/integrations/api_keys" target="_blank" rel="noreferrer" className="text-[11px] text-amber-500 hover:underline flex items-center gap-1 font-semibold">
                        Apollo Portal <ExternalLink size={11} />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={generalKeys.APOLLO_API_KEY || ""}
                        onChange={(e) => setGeneralKeys((prev) => ({ ...prev, APOLLO_API_KEY: e.target.value }))}
                        placeholder="Apollo master API key"
                        className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestConnection("apollo", "apollo", generalKeys.APOLLO_API_KEY)}
                        className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-bold"
                      >
                        Test Apollo
                      </button>
                    </div>
                    {testResults["apollo"] && !testResults["apollo"].testing && testResults["apollo"].message && (
                      <p className={`text-[11px] font-medium ${testResults["apollo"].success ? "text-emerald-500" : "text-red-500"}`}>
                        {testResults["apollo"].message}
                      </p>
                    )}
                  </div>

                  {/* Upwork Feed */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-1.5">
                    <span className="font-bold text-xs text-zinc-950 dark:text-white">Upwork Saved Search Feed URL (Private RSS)</span>
                    <input
                      type="text"
                      value={generalKeys.UPWORK_FEED_URL || ""}
                      onChange={(e) => setGeneralKeys((prev) => ({ ...prev, UPWORK_FEED_URL: e.target.value }))}
                      placeholder="https://www.upwork.com/ab/feed/jobs/rss?..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                    />
                  </div>

                  {/* Webhook */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-1.5">
                    <span className="font-bold text-xs text-zinc-950 dark:text-white">Google Sheets / n8n CRM Webhook URL</span>
                    <input
                      type="text"
                      value={generalKeys.CRM_WEBHOOK_URL || ""}
                      onChange={(e) => setGeneralKeys((prev) => ({ ...prev, CRM_WEBHOOK_URL: e.target.value }))}
                      placeholder="https://script.google.com/... or https://your-n8n.com/webhook/..."
                      className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                    />
                  </div>
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
            🔒 All keys are stored encrypted in your persistent Neon PostgreSQL cluster.
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
                  Saving Pool to Cloud DB...
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
