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
  Brain,
  MessageCircle,
  PhoneCall,
  Palette,
} from "lucide-react";
import { AIProviderConfig, VapiProviderConfig, VAPI_VOICE_OPTIONS } from "@/lib/settings";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialTab?: "brain" | "ai" | "image" | "phone" | "voice" | "integrations";
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
    defaultModel: "gemini-flash-lite-latest",
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

export default function AISettingsModal({ isOpen, onClose, onSaved, initialTab = "brain" }: AISettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"brain" | "ai" | "image" | "phone" | "voice" | "integrations">(initialTab as any);
  const [providersPool, setProvidersPool] = useState<AIProviderConfig[]>([]);
  const [vapiPool, setVapiPool] = useState<VapiProviderConfig[]>([]);
  const [generalKeys, setGeneralKeys] = useState<Record<string, string>>({
    OBEY_BRAIN_KNOWLEDGE: "",
    OBEY_CUSTOM_INSTRUCTIONS: "",
    APOLLO_API_KEY: "",
    TAVILY_API_KEY: "",
    UPWORK_FEED_URL: "",
    CRM_WEBHOOK_URL: "",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    WHATSAPP_PHONE_NUMBER: "",
    WHATSAPP_API_TOKEN: "",
    PROACTIVE_MORNING_BRIEF_ENABLED: "true",
    PROACTIVE_EVENING_CHECKIN_ENABLED: "true",
    PROACTIVE_INSTANT_ALERTS_ENABLED: "true",
    VOICE_ID: "nigerian_male",
    VOICE_PERSONALITY: "friendly",
    VOICE_HOTLINE_GREETING: "",
    GEMINI_API_KEYS: "",
    HUGGINGFACE_API_KEYS: "",
    CLOUDFLARE_API_TOKENS: "",
    CLOUDFLARE_ACCOUNT_ID: "",
    OPENAI_API_KEYS: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { testing: boolean; success?: boolean; message?: string }>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // AI Image Generator Keys Verification State
  const [verifyingImageKeys, setVerifyingImageKeys] = useState(false);
  const [verifyingImageSection, setVerifyingImageSection] = useState<string | null>(null);
  const [imageKeyVerificationResults, setImageKeyVerificationResults] = useState<any[] | null>(null);

  // Card-based key pool state for each image provider
  const [geminiKeyPool, setGeminiKeyPool] = useState<string[]>([""]);
  const [hfKeyPool, setHfKeyPool] = useState<string[]>([""]);
  const [cfKeyPool, setCfKeyPool] = useState<string[]>([""]);
  const [openaiKeyPool, setOpenaiKeyPool] = useState<string[]>([""]);

  // Per-key test results: keyed by "google-0", "hf-1", "cf-0", "openai-2" etc.
  const [keyTestResults, setKeyTestResults] = useState<Record<string, any>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const handleVerifyImageKeys = async (provider?: string) => {
    if (provider) {
      setVerifyingImageSection(provider);
    } else {
      setVerifyingImageKeys(true);
    }
    try {
      const res = await fetch("/api/obey/verify-image-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          geminiKeys: generalKeys.GEMINI_API_KEYS,
          hfKeys: generalKeys.HUGGINGFACE_API_KEYS,
          cfTokens: generalKeys.CLOUDFLARE_API_TOKENS,
          cfAccountId: generalKeys.CLOUDFLARE_ACCOUNT_ID,
          openaiKeys: generalKeys.OPENAI_API_KEYS,
        }),
      });
      const data = await res.json();
      if (data.results) {
        setImageKeyVerificationResults((prev) => {
          if (!prev || !provider) return data.results;
          const filtered = prev.filter((r) => r.provider !== provider);
          return [...filtered, ...data.results];
        });
      }
    } catch (err: any) {
      console.error("Verification error:", err);
    } finally {
      setVerifyingImageKeys(false);
      setVerifyingImageSection(null);
    }
  };

  const getImageProviderResults = (prov: string) =>
    (imageKeyVerificationResults || []).filter((r: any) => r.provider === prov);

  // Image key pool helpers
  type PoolKey = "gemini" | "hf" | "cf" | "openai";
  const poolSetters: Record<PoolKey, React.Dispatch<React.SetStateAction<string[]>>> = {
    gemini: setGeminiKeyPool,
    hf: setHfKeyPool,
    cf: setCfKeyPool,
    openai: setOpenaiKeyPool,
  };

  const addKeyToPool = (pool: PoolKey) =>
    poolSetters[pool]((prev) => [...prev, ""]);

  const removeKeyFromPool = (pool: PoolKey, idx: number) =>
    poolSetters[pool]((prev) => prev.length === 1 ? [""] : prev.filter((_, i) => i !== idx));

  const updateKeyInPool = (pool: PoolKey, idx: number, value: string) =>
    poolSetters[pool]((prev) => prev.map((k, i) => (i === idx ? value : k)));

  // Sync pool arrays → generalKeys string whenever pool changes
  const poolToString = (pool: string[]) => pool.filter(Boolean).join(",");

  // Test a single image key
  const handleTestSingleKey = async (
    provider: "google" | "huggingface" | "cloudflare" | "openai",
    keyValue: string,
    keyIndex: number,
    cfAccountId?: string
  ) => {
    const resultKey = `${provider}-${keyIndex}`;
    if (!keyValue.trim()) return;
    setTestingKey(resultKey);
    try {
      const body: Record<string, string> = { provider };
      if (provider === "google") body.geminiKeys = keyValue.trim();
      else if (provider === "huggingface") body.hfKeys = keyValue.trim();
      else if (provider === "cloudflare") {
        body.cfTokens = keyValue.trim();
        body.cfAccountId = cfAccountId || generalKeys.CLOUDFLARE_ACCOUNT_ID || "";
      } else if (provider === "openai") body.openaiKeys = keyValue.trim();

      const res = await fetch("/api/obey/verify-image-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const result = data.results?.[0] || { status: "invalid", message: "No response" };
      setKeyTestResults((prev) => ({ ...prev, [resultKey]: result }));
    } catch (err: any) {
      setKeyTestResults((prev) => ({
        ...prev,
        [resultKey]: { status: "invalid", message: err.message },
      }));
    } finally {
      setTestingKey(null);
    }
  };


  const addVapiProvider = () => {
    const newP: VapiProviderConfig = {
      id: `vapi-${Date.now()}`,
      name: `Vapi Account ${vapiPool.length + 1} ($10 Free)`,
      apiKey: "",
      publicKey: "",
      assistantId: "",
      phoneNumberId: "",
      enabled: true,
    };
    setVapiPool((prev) => [...prev, newP]);
  };

  const updateVapiProvider = (id: string, updates: Partial<VapiProviderConfig>) => {
    setVapiPool((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removeVapiProvider = (id: string) => {
    setVapiPool((prev) => prev.filter((p) => p.id !== id));
  };

  const moveVapiProvider = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= vapiPool.length) return;
    const next = [...vapiPool];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setVapiPool(next);
  };

  const getInitialCredit = (prov: VapiProviderConfig) => {
    if (prov.startingCredit !== undefined && prov.startingCredit > 0) return prov.startingCredit;
    if (prov.name.toLowerCase().includes("5 credit") || prov.name.includes("5")) return 5;
    return 10;
  };

  const handleTestVapi = async (id: string, apiKey: string, assistantId?: string, startingCredit?: number) => {
    setTestResults((prev) => ({ ...prev, [id]: { testing: true } }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_vapi",
          apiKey,
          assistantId,
          autoProvision: true,
          voiceId: generalKeys.VOICE_ID || "elliot",
          startingCredit: startingCredit || 10,
        }),
      });
      const data = await res.json();
      if (data.success) {
        updateVapiProvider(id, {
          ...(data.assistantId ? { assistantId: data.assistantId } : {}),
          ...(data.credits ? {
            startingCredit: data.credits.starting,
            creditsRemaining: data.credits.remaining,
            creditsSpent: data.credits.spent,
            totalCalls: data.credits.calls,
            talkMinutes: data.credits.talkMinutes,
            lastChecked: Date.now(),
          } : {}),
        });
      }
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          testing: false,
          success: data.success,
          message: data.message || data.error,
        },
      }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { testing: false, success: false, message: e.message },
      }));
    }
  };

  const handleCheckVapiCredits = async (id: string, apiKey: string, startingCredit?: number) => {
    if (!apiKey) return;
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_vapi_credits", apiKey, startingCredit: startingCredit || 10 }),
      });
      const data = await res.json();
      if (data.success && data.credits) {
        updateVapiProvider(id, {
          startingCredit: data.credits.starting,
          creditsRemaining: data.credits.remaining,
          creditsSpent: data.credits.spent,
          totalCalls: data.credits.calls,
          talkMinutes: data.credits.talkMinutes,
          lastChecked: Date.now(),
        });
      }
    } catch {}
  };

  // Live WhatsApp QR Code State
  const [qrData, setQrData] = useState<{ base64?: string; connected?: boolean; loading?: boolean; error?: string; pairingCode?: string }>({});

  const fetchWhatsAppQr = async (force: boolean = false) => {
    setQrData((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "whatsapp_qr", force }),
      });
      const data = await res.json();
      if (data.connected) {
        setQrData({ connected: true, loading: false });
      } else if (data.base64) {
        setQrData({ base64: data.base64, connected: false, loading: false, pairingCode: data.pairingCode });
      } else {
        setQrData({ error: data.error || "Could not retrieve QR code", loading: false });
      }
    } catch (e: any) {
      setQrData({ error: e.message, loading: false });
    }
  };

  // Auto-fetch WhatsApp QR when modal opens & auto-refresh every 8s while not connected
  useEffect(() => {
    if (!isOpen) return;
    fetchWhatsAppQr();
    const interval = setInterval(() => {
      fetchWhatsAppQr();
    }, 8000);
    return () => clearInterval(interval);
  }, [isOpen]);

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

      if (data.vapiPool && Array.isArray(data.vapiPool)) {
        setVapiPool(data.vapiPool);
      }


      if (data.settings) {
        const poolGemini = Array.isArray(data.pool)
          ? data.pool
              .filter((p: any) => p.provider === "gemini" && p.apiKey?.trim())
              .map((p: any) => p.apiKey.trim())
              .join(", ")
          : "";
        const poolOpenAI = Array.isArray(data.pool)
          ? data.pool
              .filter((p: any) => p.provider === "openai" && p.apiKey?.trim())
              .map((p: any) => p.apiKey.trim())
              .join(", ")
          : "";

        const loadedGemini = data.settings.GEMINI_API_KEYS?.value || poolGemini || "";
        const loadedHF = data.settings.HUGGINGFACE_API_KEYS?.value || "";
        const loadedCF = data.settings.CLOUDFLARE_API_TOKENS?.value || "";
        const loadedOAI = data.settings.OPENAI_API_KEYS?.value || poolOpenAI || "";

        setGeneralKeys({
          OBEY_BRAIN_KNOWLEDGE: data.settings.OBEY_BRAIN_KNOWLEDGE?.value || "",
          OBEY_CUSTOM_INSTRUCTIONS: data.settings.OBEY_CUSTOM_INSTRUCTIONS?.value || "",
          APOLLO_API_KEY: data.settings.APOLLO_API_KEY?.value || "",
          TAVILY_API_KEY: data.settings.TAVILY_API_KEY?.value || "",
          UPWORK_FEED_URL: data.settings.UPWORK_FEED_URL?.value || "",
          CRM_WEBHOOK_URL: data.settings.CRM_WEBHOOK_URL?.value || "",
          TELEGRAM_BOT_TOKEN: data.settings.TELEGRAM_BOT_TOKEN?.value || "",
          TELEGRAM_CHAT_ID: data.settings.TELEGRAM_CHAT_ID?.value || "",
          WHATSAPP_PHONE_NUMBER: data.settings.WHATSAPP_PHONE_NUMBER?.value || "",
          WHATSAPP_API_TOKEN: data.settings.WHATSAPP_API_TOKEN?.value || "",
          PROACTIVE_MORNING_BRIEF_ENABLED: data.settings.PROACTIVE_MORNING_BRIEF_ENABLED?.value || "true",
          PROACTIVE_EVENING_CHECKIN_ENABLED: data.settings.PROACTIVE_EVENING_CHECKIN_ENABLED?.value || "true",
          PROACTIVE_INSTANT_ALERTS_ENABLED: data.settings.PROACTIVE_INSTANT_ALERTS_ENABLED?.value || "true",
          GEMINI_API_KEYS: loadedGemini,
          HUGGINGFACE_API_KEYS: loadedHF,
          CLOUDFLARE_API_TOKENS: loadedCF,
          CLOUDFLARE_ACCOUNT_ID: data.settings.CLOUDFLARE_ACCOUNT_ID?.value || "",
          OPENAI_API_KEYS: loadedOAI,
        });

        // Populate card pool arrays
        const splitKeys = (s: string) => s.split(/[\s,]+/).filter(Boolean);
        setGeminiKeyPool(splitKeys(loadedGemini).length > 0 ? splitKeys(loadedGemini) : [""]);
        setHfKeyPool(splitKeys(loadedHF).length > 0 ? splitKeys(loadedHF) : [""]);
        setCfKeyPool(splitKeys(loadedCF).length > 0 ? splitKeys(loadedCF) : [""]);
        setOpenaiKeyPool(splitKeys(loadedOAI).length > 0 ? splitKeys(loadedOAI) : [""]);
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
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

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

  const handleTestTelegram = async () => {
    setTestResults((prev) => ({
      ...prev,
      telegram: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_telegram",
          token: generalKeys.TELEGRAM_BOT_TOKEN,
          chatId: generalKeys.TELEGRAM_CHAT_ID,
        }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        telegram: {
          testing: false,
          success: data.success,
          message: data.success
            ? "✅ Test message delivered to your Telegram app on your phone!"
            : `❌ ${data.error || "Failed to reach Telegram"}`,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        telegram: { testing: false, success: false, message: err.message },
      }));
    }
  };

  const handleTestBriefing = async (type: "morning" | "evening") => {
    setTestResults((prev) => ({
      ...prev,
      [type]: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_proactive_brief",
          type,
        }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [type]: {
          testing: false,
          success: data.success,
          message: data.success
            ? `✅ ${type === "morning" ? "Morning Briefing" : "Evening Check-In"} generated and sent to your phone & email!`
            : `❌ Failed: ${data.text || "Error"}`,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [type]: { testing: false, success: false, message: err.message },
      }));
    }
  };

  const handleTestGmail = async () => {
    setTestResults((prev) => ({
      ...prev,
      gmail: { testing: true },
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_gmail" }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        gmail: {
          testing: false,
          success: data.success,
          message: data.success
            ? `✅ Gmail Reader active! Checked inbox & synced ${data.syncedCount || 0} messages.`
            : `❌ Failed: ${data.error || "Sync error"}`,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        gmail: { testing: false, success: false, message: err.message },
      }));
    }
  };

  // Save all settings & pool
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    // Sync card pool arrays → generalKeys strings before saving
    const syncedKeys = {
      ...generalKeys,
      GEMINI_API_KEYS: poolToString(geminiKeyPool),
      HUGGINGFACE_API_KEYS: poolToString(hfKeyPool),
      CLOUDFLARE_API_TOKENS: poolToString(cfKeyPool),
      OPENAI_API_KEYS: poolToString(openaiKeyPool),
    };

    try {
      // 1. Save Pool
      const poolRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_pool", pool: providersPool }),
      });

      // 1b. Save Vapi Pool
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_vapi_pool", vapiPool }),
      });

      // 2. Save General Settings
      const genRes = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: syncedKeys }),
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
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold border transition-colors ${
              activeTab === "brain"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                : activeTab === "ai"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : activeTab === "image"
                ? "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20"
                : activeTab === "phone"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                : activeTab === "voice"
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            }`}>
              {activeTab === "brain" ? (
                <Brain size={20} />
              ) : activeTab === "ai" ? (
                <Zap size={20} />
              ) : activeTab === "image" ? (
                <Palette size={20} />
              ) : activeTab === "phone" ? (
                <MessageCircle size={20} />
              ) : activeTab === "voice" ? (
                <PhoneCall size={20} />
              ) : (
                <Database size={20} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-zinc-950 dark:text-white tracking-tight">
                  {activeTab === "brain"
                    ? "Obey Brain · Permanent Memory & Behavior"
                    : activeTab === "ai"
                    ? "AI Waterfall Pool · Multi-Key Fallback Chain"
                    : activeTab === "image"
                    ? "AI Image & Graphic Design Keys · 5-Tier Fallback Waterfall"
                    : activeTab === "phone"
                    ? "Phone & Messaging Gateway · WhatsApp & Telegram"
                    : activeTab === "voice"
                    ? "AI Voice Calling Pool · Free Multi-Account Fallback (Vapi.ai)"
                    : "Integrations & Automation Ecosystem"}
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  activeTab === "brain"
                    ? "bg-purple-500 text-white"
                    : activeTab === "ai"
                    ? "bg-emerald-500 text-black"
                    : activeTab === "image"
                    ? "bg-pink-500 text-white"
                    : activeTab === "phone"
                    ? "bg-blue-500 text-white"
                    : activeTab === "voice"
                    ? "bg-rose-500 text-white"
                    : "bg-amber-500 text-black"
                }`}>
                  Neon Cloud DB
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeTab === "brain"
                  ? "Permanent business facts, verified portfolio links, and behavioral instructions Obey never forgets."
                  : activeTab === "ai"
                  ? "Configure multiple keys for Gemini, Grok, etc. Auto-fails over with zero downtime."
                  : activeTab === "image"
                  ? "Configure multiple free keys for Google Gemini Imagen, Hugging Face FLUX.1 Serverless, Cloudflare Workers AI & OpenAI DALL-E 3 for ultra-high-definition graphics generation."
                  : activeTab === "phone"
                  ? "Live WhatsApp QR code pairing, keepalive status, and Telegram bot phone gateway."
                  : activeTab === "voice"
                  ? "Free multi-account Vapi pool ($10 credit per account). Obey calls on your behalf, records audio, and dispatches the MP3 to WhatsApp."
                  : "Apollo B2B lead finder API keys, Tavily live web search, Upwork RSS feeds, and CRM webhooks."}
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

        {/* Tab Navigation Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-950/70 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("brain")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "brain"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <Brain size={14} className={activeTab === "brain" ? "text-white" : "text-purple-500"} />
            <span>🧠 Obey Brain & Memory</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "ai"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <Zap size={14} className={activeTab === "ai" ? "text-white" : "text-emerald-500"} />
            <span>⚡ AI Models & Fallbacks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("image")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "image"
                ? "bg-pink-600 text-white shadow-md shadow-pink-500/25 ring-2 ring-pink-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <Palette size={14} className={activeTab === "image" ? "text-white" : "text-pink-500"} />
            <span>🎨 Image Generator Keys</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("phone")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "phone"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <MessageCircle size={14} className={activeTab === "phone" ? "text-white" : "text-blue-500"} />
            <span>💬 WhatsApp & Telegram</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("voice")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "voice"
                ? "bg-rose-600 text-white shadow-md shadow-rose-500/25 ring-2 ring-rose-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <PhoneCall size={14} className={activeTab === "voice" ? "text-white" : "text-rose-500"} />
            <span>📞 AI Voice Calls (Vapi)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("integrations")}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === "integrations"
                ? "bg-amber-600 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-500/30"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            <Database size={14} className={activeTab === "integrations" ? "text-white" : "text-amber-500"} />
            <span>🔗 Integrations (Apollo/Web)</span>
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
              {/* TAB 1: 🧠 Obey Brain · Permanent Memory & Directives */}
              {activeTab === "brain" && (
                <div className="space-y-5">
                  <div className="p-4 sm:p-5 rounded-2xl border border-purple-500/30 bg-purple-950/10 dark:bg-purple-950/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold border border-purple-500/30">
                          <Brain size={18} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-zinc-950 dark:text-white">
                            Obey Core Brain & Permanent Memory
                          </h4>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Stored in Neon PostgreSQL. Obey permanently remembers this across WhatsApp, Telegram, Website Chat & Admin.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-purple-500 text-white shadow-sm">
                        Active Memory
                      </span>
                    </div>

                    {/* Quick Helper Buttons */}
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const facts = 
`• Full Name: Femi Adeleke
• Title: Full-Stack Developer & Automation Architect
• Location & Timezone: Nigeria (West Africa Time, WAT / UTC+1)
• Official Portfolio: https://obeyai.vercel.app
• GitHub Profile: https://github.com/Phemmy111
• Direct Contact Line: +2348120934828 / 08120934828
• Official Email: femiadeleke2020@gmail.com
• Flagship Projects:
  1. OKIKI Electronics Store: High-performance Next.js 16 e-commerce platform with Tailwind CSS, instant cart management and 98 Lighthouse performance.
  2. PassMark UTME Prep App: Offline CBT exam practice and study application built with Flutter & Supabase.
  3. AutoLearn Spot: EdTech platform and student curriculum management portal.
  4. Enterprise n8n Pipelines: Autonomous WhatsApp webhook bots, automated CRM leads sync, and invoice delivery.
• Pricing & Engagement: Custom proposals based on scope. Standard web builds start from $1,500 / ₦2,000,000. Femi offers a 10-minute discovery call to align on technical specs.`;
                          setGeneralKeys((prev) => ({ ...prev, OBEY_BRAIN_KNOWLEDGE: facts }));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-300 border border-purple-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        📋 Insert Real Portfolio & Business Facts
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const directives = 
`• Tone: Sharp, confident, respectful, and direct. Avoid unnecessary corporate jargon.
• Gender Neutrality: When speaking with external clients or website visitors, NEVER address them as "sir" or assume their gender. Use neutral, professional phrasing.
• Discovery Calls: When a prospective client asks about pricing or starting a project, offer a brief 10-minute discovery call with Femi to review their architecture.
• Honesty: If an AI model is unavailable or rate-limited, never generate fake canned replies. Always be transparent.
• Executive Role: Address Femi as Boss or sir, and keep operational reports concise with clear next steps.`;
                          setGeneralKeys((prev) => ({ ...prev, OBEY_CUSTOM_INSTRUCTIONS: directives }));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        ⚡ Insert Recommended Behavior Directives
                      </button>
                    </div>
                  </div>

                  {/* Core Knowledge Textarea */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                        🧠 Core Knowledge & Facts (Things Obey Must Never Forget)
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {generalKeys.OBEY_BRAIN_KNOWLEDGE ? `${generalKeys.OBEY_BRAIN_KNOWLEDGE.length} characters` : "Empty"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Paste business details, real portfolio links, pricing rules, project facts, phone numbers, or client FAQs.
                    </p>
                    <textarea
                      rows={8}
                      value={generalKeys.OBEY_BRAIN_KNOWLEDGE || ""}
                      onChange={(e) => setGeneralKeys((prev) => ({ ...prev, OBEY_BRAIN_KNOWLEDGE: e.target.value }))}
                      placeholder={`e.g.\n• Femi's direct WhatsApp phone line is +2348120934828.\n• Real portfolio link: https://obeyai.vercel.app\n• Standard web development projects start from $1,500 / ₦2,000,000.\n• PassMark UTME Prep App is an offline CBT study app built with Flutter and Supabase.\n• OKIKI Electronics Store was built with Next.js 16.`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 leading-relaxed resize-y"
                    />
                  </div>

                  {/* Custom Behavior Directives */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                        ⚡ Custom Behavioral Instructions & Personality Directives
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {generalKeys.OBEY_CUSTOM_INSTRUCTIONS ? `${generalKeys.OBEY_CUSTOM_INSTRUCTIONS.length} characters` : "Empty"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Specify how Obey should act, speak, greet, or respond to clients and commands.
                    </p>
                    <textarea
                      rows={6}
                      value={generalKeys.OBEY_CUSTOM_INSTRUCTIONS || ""}
                      onChange={(e) => setGeneralKeys((prev) => ({ ...prev, OBEY_CUSTOM_INSTRUCTIONS: e.target.value }))}
                      placeholder={`e.g.\n• Always maintain a sharp, confident, and direct tone without corporate fluff.\n• When speaking with external visitors, never address them as 'sir' — use neutral professional greetings.\n• When prospective clients ask for pricing or a call, offer a 10-minute discovery chat with Femi.\n• Never disclose internal budget margins without Femi's explicit permission.`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 leading-relaxed resize-y"
                    />
                  </div>

                  {/* Direct Save Button in Brain tab */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-zinc-500">
                      Changes take effect immediately across all Obey channels upon saving.
                    </p>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Brain size={14} />
                      {saving ? "Saving to Cloud DB..." : "Save Obey Brain Memory"}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: ⚡ Multi-Key Provider Pool */}
              {activeTab === "ai" && (
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
            )}

            {/* TAB: 🎨 AI Image Generator Keys (5-Tier Waterfall) */}
            {activeTab === "image" && (
              <div className="space-y-5">
                {/* Top Banner & Quick Verification Trigger */}
                <div className="p-4 sm:p-5 rounded-2xl border border-pink-500/30 bg-pink-950/10 dark:bg-pink-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-500 flex items-center justify-center font-bold border border-pink-500/30">
                        <Palette size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-zinc-950 dark:text-white">
                            Autonomous AI Image & Graphic Flyer Engine
                          </h4>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-pink-500 text-white">
                            5-Tier Fallback
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Obey automatically cascades top-to-bottom across providers with zero downtime. Multi-key comma-separated pools rotate automatically on rate limits.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleVerifyImageKeys()}
                      disabled={verifyingImageKeys}
                      className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-black shadow-md shadow-pink-500/25 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw size={13} className={verifyingImageKeys ? "animate-spin" : ""} />
                      {verifyingImageKeys ? "Testing All Keys..." : "⚡ Test All Keys Live"}
                    </button>
                  </div>
                </div>

                {/* Live Verification Results Panel */}
                {imageKeyVerificationResults && (
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-500" /> Live Key Verification Diagnostics
                      </span>
                      <button
                        type="button"
                        onClick={() => setImageKeyVerificationResults(null)}
                        className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {imageKeyVerificationResults.map((r: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            r.status === "active"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : r.status === "rate_limited"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                              : r.status === "not_configured"
                              ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-500"
                              : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{r.provider}</span>
                            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                              {r.status === "active" ? "Active" : r.status === "image_quota_zero" ? "Quota 0 (Chat Only)" : r.status === "invalid_format" ? "Format Error" : "Invalid"}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug">{r.message}</p>
                          {(r.keyMasked || r.keyMask) && (
                            <span className="text-[10px] font-mono opacity-70 block">{r.keyMasked || r.keyMask}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. Google Gemini / Imagen */}
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="font-bold text-xs text-zinc-950 dark:text-white">
                        1. Google Gemini / Imagen Keys (Primary Provider)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Free 500 req/day per key
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyImageKeys("google")}
                        disabled={verifyingImageSection === "google" || verifyingImageKeys}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                        title="Test all Google keys in this box live"
                      >
                        <RefreshCw size={11} className={verifyingImageSection === "google" ? "animate-spin" : ""} />
                        {verifyingImageSection === "google" ? "Testing..." : "🧪 Test Google Keys"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const geminiKeysFromPool = providersPool
                            .filter((p) => p.provider === "gemini" && p.apiKey?.trim())
                            .map((p) => p.apiKey.trim());
                          if (geminiKeysFromPool.length > 0) {
                            const existing = (generalKeys.GEMINI_API_KEYS || "").split(/[\s,]+/).filter(Boolean);
                            const merged = Array.from(new Set([...existing, ...geminiKeysFromPool])).join(", ");
                            setGeneralKeys((prev) => ({ ...prev, GEMINI_API_KEYS: merged }));
                          } else {
                            alert("No Gemini keys found in your AI Models pool yet.");
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Copy all Gemini keys currently configured in your AI Models Waterfall"
                      >
                        📋 Auto-Copy from AI Models
                      </button>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-semibold"
                      >
                        AI Studio <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                   <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Paste Google AI Studio keys (format starts with <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-zinc-800 dark:text-zinc-200">AIzaSy...</code>). Add multiple keys for automatic round-robin rotation.
                  </p>

                  {/* Card-based key rows */}
                  <div className="space-y-2">
                    {geminiKeyPool.map((key, idx) => {
                      const rk = `google-${idx}`;
                      const result = keyTestResults[rk];
                      const isTesting = testingKey === rk;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-400 w-5 shrink-0">#{idx + 1}</span>
                            <input
                              type="password"
                              value={key}
                              onChange={(e) => updateKeyInPool("gemini", idx, e.target.value)}
                              placeholder="AIzaSy..."
                              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                            <button
                              type="button"
                              onClick={() => handleTestSingleKey("google", key, idx)}
                              disabled={isTesting || !key.trim()}
                              className="px-2.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition flex items-center gap-1 disabled:opacity-40 shrink-0"
                            >
                              <RefreshCw size={10} className={isTesting ? "animate-spin" : ""} />
                              {isTesting ? "…" : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeKeyFromPool("gemini", idx)}
                              className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition shrink-0"
                              title="Remove key"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {result && (
                            <div className={`ml-7 p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                              result.status === "active"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : result.status === "image_quota_zero"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                            }`}>
                              <span className="leading-snug">{result.message}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {result.latencyMs !== undefined && (
                                  <span className="text-[10px] font-mono opacity-60">{result.latencyMs}ms</span>
                                )}
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  result.status === "active"
                                    ? "bg-emerald-500 text-white"
                                    : result.status === "image_quota_zero"
                                    ? "bg-amber-500 text-black"
                                    : "bg-red-500 text-white"
                                }`}>
                                  {result.status === "active" ? "Active ✅" : result.status === "image_quota_zero" ? "Quota 0 ⚠️" : "Invalid ❌"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => addKeyToPool("gemini")}
                    className="w-full py-2 rounded-xl border border-dashed border-blue-500/40 text-blue-500 hover:bg-blue-500/10 text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={12} /> Add Google Key
                  </button>
                </div>



                {/* 2. Hugging Face FLUX.1 */}
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="font-bold text-xs text-zinc-950 dark:text-white">
                        2. Hugging Face FLUX.1 Schnell Keys (Ultra-Photorealistic)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        100% Free Read Token
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyImageKeys("huggingface")}
                        disabled={verifyingImageSection === "huggingface" || verifyingImageKeys}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                        title="Test all Hugging Face tokens live"
                      >
                        <RefreshCw size={11} className={verifyingImageSection === "huggingface" ? "animate-spin" : ""} />
                        {verifyingImageSection === "huggingface" ? "Testing..." : "🧪 Test HF Tokens"}
                      </button>
                      <a
                        href="https://huggingface.co/settings/tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-amber-500 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Get HF Token (Hugging Face) <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Create a free Read Token at Hugging Face (starts with <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-zinc-800 dark:text-zinc-200">hf_...</code>). Ultra-fast commercial flyers and advertising visuals.
                  </p>

                  {/* Card-based key rows */}
                  <div className="space-y-2">
                    {hfKeyPool.map((key, idx) => {
                      const rk = `huggingface-${idx}`;
                      const result = keyTestResults[rk];
                      const isTesting = testingKey === rk;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-400 w-5 shrink-0">#{idx + 1}</span>
                            <input
                              type="password"
                              value={key}
                              onChange={(e) => updateKeyInPool("hf", idx, e.target.value)}
                              placeholder="hf_..."
                              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                            />
                            <button
                              type="button"
                              onClick={() => handleTestSingleKey("huggingface", key, idx)}
                              disabled={isTesting || !key.trim()}
                              className="px-2.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition flex items-center gap-1 disabled:opacity-40 shrink-0"
                            >
                              <RefreshCw size={10} className={isTesting ? "animate-spin" : ""} />
                              {isTesting ? "…" : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeKeyFromPool("hf", idx)}
                              className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition shrink-0"
                              title="Remove key"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {result && (
                            <div className={`ml-7 p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                              result.status === "active"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                            }`}>
                              <span className="leading-snug">{result.message}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {result.latencyMs !== undefined && (
                                  <span className="text-[10px] font-mono opacity-60">{result.latencyMs}ms</span>
                                )}
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  result.status === "active" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                                }`}>
                                  {result.status === "active" ? "Active ✅" : "Invalid ❌"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => addKeyToPool("hf")}
                    className="w-full py-2 rounded-xl border border-dashed border-amber-500/40 text-amber-500 hover:bg-amber-500/10 text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={12} /> Add HF Token
                  </button>
                </div>



                {/* 3. Cloudflare Workers AI */}
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                      <span className="font-bold text-xs text-zinc-950 dark:text-white">
                        3. Cloudflare Workers AI FLUX (Serverless Edge)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        10,000 neurons/day free
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyImageKeys("cloudflare")}
                        disabled={verifyingImageSection === "cloudflare" || verifyingImageKeys}
                        className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                        title="Test Cloudflare token live"
                      >
                        <RefreshCw size={11} className={verifyingImageSection === "cloudflare" ? "animate-spin" : ""} />
                        {verifyingImageSection === "cloudflare" ? "Testing..." : "🧪 Test Cloudflare Token"}
                      </button>
                      <a
                        href="https://dash.cloudflare.com/profile/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-orange-500 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Cloudflare API Tokens <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    High-speed global edge inference with Cloudflare Workers AI FLUX.1-schnell model.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                        Cloudflare API Token
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={cfKeyPool[0] || ""}
                          onChange={(e) => updateKeyInPool("cf", 0, e.target.value)}
                          placeholder="cfut_..."
                          className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                        <button
                          type="button"
                          onClick={() => handleTestSingleKey("cloudflare", cfKeyPool[0] || "", 0, generalKeys.CLOUDFLARE_ACCOUNT_ID)}
                          disabled={testingKey === "cloudflare-0" || !(cfKeyPool[0] || "").trim()}
                          className="px-2.5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold transition flex items-center gap-1 disabled:opacity-40 shrink-0"
                        >
                          <RefreshCw size={10} className={testingKey === "cloudflare-0" ? "animate-spin" : ""} />
                          {testingKey === "cloudflare-0" ? "…" : "Test"}
                        </button>
                      </div>
                      {keyTestResults["cloudflare-0"] && (
                        <div className={`mt-1.5 p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                          keyTestResults["cloudflare-0"].status === "active"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                        }`}>
                          <span className="leading-snug">{keyTestResults["cloudflare-0"].message}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {keyTestResults["cloudflare-0"].latencyMs !== undefined && (
                              <span className="text-[10px] font-mono opacity-60">{keyTestResults["cloudflare-0"].latencyMs}ms</span>
                            )}
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              keyTestResults["cloudflare-0"].status === "active" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                            }`}>
                              {keyTestResults["cloudflare-0"].status === "active" ? "Active ✅" : "Invalid ❌"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                        Cloudflare Account ID
                      </label>
                      <input
                        type="text"
                        value={generalKeys.CLOUDFLARE_ACCOUNT_ID || ""}
                        onChange={(e) => setGeneralKeys((prev) => ({ ...prev, CLOUDFLARE_ACCOUNT_ID: e.target.value }))}
                        placeholder="Found in your Cloudflare dashboard URL"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. OpenAI DALL-E 3 */}
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="font-bold text-xs text-zinc-950 dark:text-white">
                        4. OpenAI DALL-E 3 (Optional HD Fallback)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        HD 1024x1792 Quality
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-500 hover:underline flex items-center gap-1 font-semibold"
                      >
                        OpenAI Platform <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    If configured, Obey can fall back to OpenAI DALL-E 3 HD. Leave blank to rely entirely on free Google Gemini and Hugging Face FLUX.
                  </p>

                  {/* Card-based key rows */}
                  <div className="space-y-2">
                    {openaiKeyPool.map((key, idx) => {
                      const rk = `openai-${idx}`;
                      const result = keyTestResults[rk];
                      const isTesting = testingKey === rk;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-400 w-5 shrink-0">#{idx + 1}</span>
                            <input
                              type="password"
                              value={key}
                              onChange={(e) => updateKeyInPool("openai", idx, e.target.value)}
                              placeholder="sk-..."
                              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                            <button
                              type="button"
                              onClick={() => handleTestSingleKey("openai", key, idx)}
                              disabled={isTesting || !key.trim()}
                              className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center gap-1 disabled:opacity-40 shrink-0"
                            >
                              <RefreshCw size={10} className={isTesting ? "animate-spin" : ""} />
                              {isTesting ? "…" : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeKeyFromPool("openai", idx)}
                              className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition shrink-0"
                              title="Remove key"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {result && (
                            <div className={`ml-7 p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                              result.status === "active"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                            }`}>
                              <span className="leading-snug">{result.message}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {result.latencyMs !== undefined && (
                                  <span className="text-[10px] font-mono opacity-60">{result.latencyMs}ms</span>
                                )}
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  result.status === "active" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                                }`}>
                                  {result.status === "active" ? "Active ✅" : "Invalid ❌"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => addKeyToPool("openai")}
                    className="w-full py-2 rounded-xl border border-dashed border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={12} /> Add OpenAI Key
                  </button>
                </div>



                {/* Ultra-HD Quality Assurance Notice */}
                <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-bold text-xs text-zinc-950 dark:text-white">
                      Ultra-HD Quality Protected
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Low-quality free web fallbacks are permanently disabled. Obey only outputs high-resolution photorealistic artwork via your configured Google, Hugging Face FLUX.1, Cloudflare, or DALL-E engines.
                  </p>
                </div>

                {/* Save Button for Image Tab */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-[11px] text-zinc-500">
                    Keys are encrypted and stored in your Neon cloud database cluster.
                  </p>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-pink-500/25 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Palette size={14} />
                    {saving ? "Saving to Cloud DB..." : "Save Image Generator Keys"}
                  </button>
                </div>
              </div>
            )}

              {/* TAB 4: 🔗 Integrations (Apollo, Tavily, Upwork, CRM) */}
              {activeTab === "integrations" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Database size={14} /> Apollo.io & Workflow Automation
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Connect lead search APIs, live web search, and CRM webhooks for autonomous scouting.
                      </p>
                    </div>
                  </div>

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

                  {/* Tavily AI Web Search */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                        <Sparkles size={13} className="text-emerald-500" />
                        Tavily API Key (Real-Time Live Web Search)
                      </span>
                      <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-[11px] text-emerald-500 hover:underline flex items-center gap-1 font-semibold">
                        Get Tavily Key <ExternalLink size={11} />
                      </a>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Enables Obey to search Google and the live web in real time for research, verified company facts, and live information.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={generalKeys.TAVILY_API_KEY || ""}
                        onChange={(e) => setGeneralKeys((prev) => ({ ...prev, TAVILY_API_KEY: e.target.value }))}
                        placeholder="tvly-..."
                        className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestConnection("tavily", "tavily", generalKeys.TAVILY_API_KEY)}
                        className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-bold"
                      >
                        Test Tavily
                      </button>
                    </div>
                    {testResults["tavily"] && !testResults["tavily"].testing && testResults["tavily"].message && (
                      <p className={`text-[11px] font-medium ${testResults["tavily"].success ? "text-emerald-500" : "text-red-500"}`}>
                        {testResults["tavily"].message}
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
            )}

              {/* TAB 3: 📱 Phone Apps & Autonomous Proactive Briefings (FO by Wajo.ai Style) */}
              {activeTab === "phone" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      📱 Phone Apps & Autonomous Proactivity (Wajo.ai / Fo Style)
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      Proactive 24/7
                    </span>
                  </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Connect your phone apps so Obey can message you first with morning briefings, instant lead alerts, and let you chat or approve tasks while walking or on the go.
                </p>

                <div className="space-y-3">
                  {/* Telegram Gateway */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                          ✈️ Telegram Bot Gateway (Free, Instant Phone Connect)
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Get your bot token in 30 seconds from @BotFather on Telegram, and Chat ID from @userinfobot.
                        </p>
                      </div>
                      <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-semibold shrink-0">
                        Open @BotFather <ExternalLink size={11} />
                      </a>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                          Telegram Bot Token
                        </label>
                        <input
                          type="password"
                          value={generalKeys.TELEGRAM_BOT_TOKEN || ""}
                          onChange={(e) => setGeneralKeys((prev) => ({ ...prev, TELEGRAM_BOT_TOKEN: e.target.value }))}
                          placeholder="e.g. 7123456789:AAH..."
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                          Your Telegram Chat ID
                        </label>
                        <input
                          type="text"
                          value={generalKeys.TELEGRAM_CHAT_ID || ""}
                          onChange={(e) => setGeneralKeys((prev) => ({ ...prev, TELEGRAM_CHAT_ID: e.target.value }))}
                          placeholder="e.g. 123456789 (from @userinfobot)"
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={testResults["telegram"]?.testing || !generalKeys.TELEGRAM_BOT_TOKEN || !generalKeys.TELEGRAM_CHAT_ID}
                        className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                      >
                        {testResults["telegram"]?.testing ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            Sending Ping...
                          </>
                        ) : (
                          "📱 Send Test Ping to My Phone"
                        )}
                      </button>

                      {testResults["telegram"] && !testResults["telegram"].testing && testResults["telegram"].message && (
                        <span className={`text-[11px] font-bold ${testResults["telegram"].success ? "text-emerald-500" : "text-red-500"}`}>
                          {testResults["telegram"].message}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp Gateway */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                          💬 WhatsApp Integration (Self-Hosted Evolution API / Baileys)
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Connects directly as a Linked Device to your personal WhatsApp without Meta verification.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {qrData.connected ? "● Connected & Linked" : "Ready to Pair"}
                      </span>
                    </div>

                    {/* Live QR Code Box Inside Modal */}
                    <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="space-y-1 text-center sm:text-left">
                        <div className="flex items-center gap-2 justify-center sm:justify-start">
                          <p className="text-xs font-black text-zinc-950 dark:text-white">
                            📱 Scan to Pair Your WhatsApp
                          </p>
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Auto-refreshes live
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
                          Open WhatsApp on your phone &rarr; <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong> &rarr; Scan this live QR code.
                        </p>
                        {qrData.pairingCode && (
                          <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-[11px] font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            Pairing Code: <span className="text-emerald-600 dark:text-emerald-400">{qrData.pairingCode}</span>
                          </div>
                        )}
                        <div className="pt-2 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                          <button
                            type="button"
                            onClick={() => fetchWhatsAppQr(false)}
                            disabled={qrData.loading}
                            className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-[11px] font-bold flex items-center gap-1.5 transition-all"
                          >
                            <RefreshCw size={11} className={qrData.loading ? "animate-spin" : ""} />
                            {qrData.loading ? "Checking..." : "Refresh Status"}
                          </button>
                          <button
                            type="button"
                            onClick={() => fetchWhatsAppQr(true)}
                            disabled={qrData.loading}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold transition-all"
                          >
                            Reset & New QR
                          </button>
                          <a
                            href="/api/obey/whatsapp/keepalive"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold transition-all flex items-center gap-1"
                          >
                            ⚡ 24/7 Keep-Alive Link <ExternalLink size={10} />
                          </a>
                        </div>
                        <p className="text-[10px] text-zinc-500 pt-1">
                          🟢 <strong>24/7 Auto-Keepalive Active:</strong> Obey auto-pings Render every 3 mins to prevent 15-minute sleep and auto-heals any disconnect.
                        </p>
                      </div>

                      <div className="shrink-0 flex flex-col items-center justify-center p-2.5 rounded-2xl bg-white border border-zinc-200 dark:border-zinc-700 shadow-sm min-w-[150px] min-h-[150px]">
                        {qrData.connected ? (
                          <div className="text-center p-4">
                            <span className="text-3xl block mb-2">✅</span>
                            <p className="text-xs font-black text-emerald-600">WhatsApp Linked!</p>
                            <p className="text-[10px] text-zinc-500">24/7 Active on Neon DB</p>
                            <button
                              type="button"
                              onClick={() => fetchWhatsAppQr(true)}
                              className="mt-2 text-[10px] text-amber-600 hover:underline font-bold"
                            >
                              Disconnect & Re-pair
                            </button>
                          </div>
                        ) : qrData.base64 ? (
                          <div className="text-center">
                            <img
                              src={qrData.base64}
                              alt="WhatsApp Live Pairing QR"
                              className="w-36 h-36 object-contain rounded-lg"
                            />
                            <p className="text-[9px] text-zinc-400 mt-1 font-mono">Scan before expiration</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fetchWhatsAppQr(false)}
                            className="text-center p-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex flex-col items-center gap-2"
                          >
                            <RefreshCw size={16} className={qrData.loading ? "animate-spin" : ""} />
                            {qrData.loading ? "Loading QR..." : "Click to Display Live QR"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                          Your WhatsApp Phone Number
                        </label>
                        <input
                          type="text"
                          value={generalKeys.WHATSAPP_PHONE_NUMBER || ""}
                          onChange={(e) => setGeneralKeys((prev) => ({ ...prev, WHATSAPP_PHONE_NUMBER: e.target.value }))}
                          placeholder="e.g. 2348120934828"
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                          n8n Webhook / Meta Token (Optional)
                        </label>
                        <input
                          type="password"
                          value={generalKeys.WHATSAPP_API_TOKEN || ""}
                          onChange={(e) => setGeneralKeys((prev) => ({ ...prev, WHATSAPP_API_TOKEN: e.target.value }))}
                          placeholder="Optional if using Evolution API directly"
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-950 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Proactive Schedules & Live Trigger Tests */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-3">
                    <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                      ⏰ Autonomous Proactive Timers & Briefings
                    </span>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-950 dark:text-white">☀️ 8:00 AM Morning Briefing</span>
                          <button
                            type="button"
                            onClick={() => handleTestBriefing("morning")}
                            disabled={testResults["morning"]?.testing}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          >
                            {testResults["morning"]?.testing ? "Sending..." : "Test Send"}
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          Obey wakes up at 8 AM WAT and messages your phone with today's priorities and fresh leads.
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-950 dark:text-white">🌙 8:00 PM Evening Check-In</span>
                          <button
                            type="button"
                            onClick={() => handleTestBriefing("evening")}
                            disabled={testResults["evening"]?.testing}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400"
                          >
                            {testResults["evening"]?.testing ? "Sending..." : "Test Send"}
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          Obey checks in at 8 PM WAT to see how work went, logs your thoughts, and offers support.
                        </p>
                      </div>
                    </div>

                    {(testResults["morning"]?.message || testResults["evening"]?.message) && (
                      <p className="text-[11px] font-bold text-emerald-500">
                        {testResults["morning"]?.message || testResults["evening"]?.message}
                      </p>
                    )}
                  </div>

                  {/* Deep 2-Way Gmail Reader & Auto-Reply Gateway */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0e] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-zinc-950 dark:text-white flex items-center gap-1.5">
                          📬 2-Way Gmail Reader & Autonomous Lead Responder
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Obey scans your incoming emails, evaluates project leads, crafts smart responses, and alerts your phone.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Active via SMTP/IMAP
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleTestGmail}
                        disabled={testResults["gmail"]?.testing}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {testResults["gmail"]?.testing ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            Checking Inbox...
                          </>
                        ) : (
                          "📬 Test Scan Inbox & Sync Leads"
                        )}
                      </button>

                      {testResults["gmail"] && !testResults["gmail"].testing && testResults["gmail"].message && (
                        <span className={`text-[11px] font-bold ${testResults["gmail"].success ? "text-emerald-500" : "text-red-500"}`}>
                          {testResults["gmail"].message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* TAB: 📞 AI Voice Calling */}
              {activeTab === "voice" && (
                <div className="space-y-6">
                  {/* Obey High-Speed AI Voice Hotline (Vapi Engine) */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 dark:bg-emerald-950/20 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/30">
                          <PhoneCall size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-zinc-950 dark:text-white">
                              Obey AI Voice Hotline (Vapi Engine)
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              ⚡ Ultra-Low Latency • WebRTC
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Enterprise duplex WebRTC audio with Deepgram Nova-2 (250ms endpointing) & instant conversational streaming. Automatic WhatsApp voice notes & executive summaries.
                          </p>
                        </div>
                      </div>
                      <a
                        href="/call"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 underline underline-offset-4"
                      >
                        Launch Voice Call &rarr;
                      </a>
                    </div>

                    {/* Main Obey Vapi Voice Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          🎙️ Main Obey Voice (Vapi / Cartesia / ElevenLabs)
                        </label>
                        <span className="text-[10px] text-emerald-400 font-medium">Real-Time Sub-400ms Audio</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {VAPI_VOICE_OPTIONS.map((v) => {
                          const isSelected = (generalKeys.VOICE_ID || "elliot") === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setGeneralKeys((prev) => ({ ...prev, VOICE_ID: v.id }))}
                              className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                                isSelected
                                  ? "bg-emerald-500/15 border-emerald-500/80 ring-1 ring-emerald-500/50"
                                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-950 dark:text-white">
                                <span>{v.flag}</span>
                                <span>{v.name}</span>
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{v.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Main Obey Personality & Speaking Tone */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                        🧠 Main Obey Personality & Speaking Tone
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: "professional", emoji: "💼", label: "Professional", desc: "Articulate Executive" },
                          { id: "friendly", emoji: "🤝", label: "Warm Brotherly", desc: "Supportive Friend" },
                          { id: "nigerian_pidgin", emoji: "⚡", label: "Authentic Naija", desc: "Pidgin & Sharp-sharp" },
                          { id: "direct", emoji: "🎯", label: "Direct & Concise", desc: "Zero fluff, punchy" },
                        ].map((p) => {
                          const isSelected = (generalKeys.VOICE_PERSONALITY || "friendly") === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setGeneralKeys((prev) => ({ ...prev, VOICE_PERSONALITY: p.id }))}
                              className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                                isSelected
                                  ? "bg-purple-500/15 border-purple-500/80 ring-1 ring-purple-500/50"
                                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-950 dark:text-white">
                                <span>{p.emoji}</span>
                                <span>{p.label}</span>
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{p.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Opening Spoken Greeting */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                        📢 Opening Voice Call Greeting
                      </label>
                      <textarea
                        rows={2}
                        value={generalKeys.VOICE_HOTLINE_GREETING || ""}
                        onChange={(e) => setGeneralKeys((prev) => ({ ...prev, VOICE_HOTLINE_GREETING: e.target.value }))}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs text-zinc-900 dark:text-zinc-200 focus:border-zinc-400 outline-none leading-relaxed transition"
                        placeholder="Hello Friend! Great to connect with you today! I am Obey, your personal executive AI companion. How can I assist you today?"
                      />
                    </div>
                  </div>

                  {/* Strategy & Webhook Banner */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-rose-500/30 bg-rose-950/10 dark:bg-rose-950/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold border border-rose-500/30">
                          <PhoneCall size={18} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-zinc-950 dark:text-white">
                            Zero-Cost Multi-Account Voice Calling
                          </h4>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Each free Vapi account gives $10 in credits (~100-150 calling minutes). Add multiple accounts below for infinite free failover!
                          </p>
                        </div>
                      </div>
                      <a
                        href="https://dashboard.vapi.ai"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 underline underline-offset-4"
                      >
                        Open Vapi Console <ExternalLink size={12} />
                      </a>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-300">🔗 Vapi Webhook Server URL:</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Auto-Recording & Transcription</span>
                      </div>
                      <div className="p-2 rounded-lg bg-black font-mono text-[11px] text-zinc-300 break-all select-all border border-zinc-800">
                        https://obeyai.vercel.app/api/obey/calls/webhook
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Paste this into your Vapi Assistant Server URL. When Obey finishes a call, Vapi automatically sends the <span className="text-zinc-300 font-bold">full audio recording (.mp3) + transcription</span> to Obey, and Obey sends it straight into WhatsApp as a playable voice note!
                      </p>
                    </div>
                  </div>

                  {/* Vapi Provider Cards */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">
                          Active Vapi Account Waterfall ({vapiPool.length})
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Auto-Failover on 400/402
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={addVapiProvider}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5 transition-all"
                      >
                        <Plus size={13} />
                        Add Vapi Account
                      </button>
                    </div>

                    {vapiPool.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl space-y-2">
                        <PhoneCall size={28} className="mx-auto text-zinc-400" />
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          No Vapi accounts configured yet
                        </p>
                        <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                          Sign up at vapi.ai, grab your Private API Key, and click &quot;Add Vapi Account&quot; to enable AI voice calling for free.
                        </p>
                        <button
                          type="button"
                          onClick={addVapiProvider}
                          className="mt-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs inline-flex items-center gap-1.5 transition-all shadow-md shadow-rose-500/20"
                        >
                          <Plus size={13} />
                          Add First Vapi Account
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {vapiPool.map((prov, index) => {
                          const result = testResults[prov.id];
                          return (
                            <div
                              key={prov.id}
                              className={`p-4 rounded-2xl border transition-all ${
                                prov.enabled
                                  ? "bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800"
                                  : "bg-zinc-100/50 dark:bg-zinc-950/40 border-dashed border-zinc-300 dark:border-zinc-800/60 opacity-60"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    index === 0
                                      ? "bg-rose-500 text-white shadow-sm"
                                      : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                  }`}>
                                    #{index + 1} {index === 0 ? "PRIMARY" : "FALLBACK"}
                                  </span>

                                  <input
                                    type="text"
                                    value={prov.name}
                                    onChange={(e) => updateVapiProvider(prov.id, { name: e.target.value })}
                                    className="text-xs font-black bg-transparent border-b border-transparent hover:border-zinc-400 dark:hover:border-zinc-600 focus:border-rose-500 focus:outline-none px-1 py-0.5 text-zinc-900 dark:text-white"
                                    placeholder="Account Name"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveVapiProvider(index, "up")}
                                    disabled={index === 0}
                                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 transition-all"
                                    title="Move Priority Up"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveVapiProvider(index, "down")}
                                    disabled={index === vapiPool.length - 1}
                                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 transition-all"
                                    title="Move Priority Down"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateVapiProvider(prov.id, { enabled: !prov.enabled })}
                                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                    title={prov.enabled ? "Disable Provider" : "Enable Provider"}
                                  >
                                    {prov.enabled ? (
                                      <ToggleRight size={18} className="text-rose-500" />
                                    ) : (
                                      <ToggleLeft size={18} className="text-zinc-500" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeVapiProvider(prov.id)}
                                    className="p-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                    title="Remove Provider"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Live Account Credit Balance & Minutes Remaining */}
                              {(() => {
                                const starting = prov.startingCredit || ((prov.name || "").toLowerCase().includes("5") ? 5 : 10);
                                const spent = prov.creditsSpent ?? 0;
                                const remaining = prov.creditsRemaining !== undefined 
                                  ? prov.creditsRemaining 
                                  : Math.max(0, starting - spent);
                                const realMins = prov.talkMinutes !== undefined 
                                  ? prov.talkMinutes 
                                  : Math.floor(remaining / 0.07);

                                return (
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <span className={`w-2.5 h-2.5 rounded-full ${
                                        remaining > 2 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : remaining > 0.5 ? "bg-amber-400" : "bg-red-500"
                                      } animate-pulse`} />
                                      <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-white text-sm">
                                          ${remaining.toFixed(2)} <span className="text-zinc-500 font-normal text-xs">/ ${starting}.00</span>
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                          ~{realMins} real minutes left
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                                      {/* Plan Switcher: $5 or $10 */}
                                      <div className="flex items-center bg-zinc-900 border border-zinc-700/80 rounded-lg p-0.5 text-[10px]">
                                        <span className="text-zinc-400 px-1.5 font-medium">Plan:</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newStarting = 5;
                                            const newRemaining = Math.max(0, newStarting - spent);
                                            updateVapiProvider(prov.id, {
                                              startingCredit: newStarting,
                                              creditsRemaining: newRemaining,
                                              talkMinutes: Math.floor(newRemaining / 0.07)
                                            });
                                          }}
                                          className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                                            starting === 5 ? "bg-rose-500 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                                          }`}
                                          title="$5 Starter Credit Account"
                                        >
                                          $5
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newStarting = 10;
                                            const newRemaining = Math.max(0, newStarting - spent);
                                            updateVapiProvider(prov.id, {
                                              startingCredit: newStarting,
                                              creditsRemaining: newRemaining,
                                              talkMinutes: Math.floor(newRemaining / 0.07)
                                            });
                                          }}
                                          className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                                            starting === 10 ? "bg-rose-500 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                                          }`}
                                          title="$10 Standard Free Credit Account"
                                        >
                                          $10
                                        </button>
                                      </div>

                                      <span className="text-[10px] text-zinc-500 hidden md:inline">
                                        {prov.totalCalls ?? 0} calls (${spent.toFixed(2)} spent)
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => handleCheckVapiCredits(prov.id, prov.apiKey, starting)}
                                        className="text-[11px] text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer hover:opacity-80 transition-opacity"
                                      >
                                        Refresh
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                    Private API Key *
                                  </label>
                                  <input
                                    type="password"
                                    value={prov.apiKey}
                                    onChange={(e) => updateVapiProvider(prov.id, { apiKey: e.target.value })}
                                    placeholder="vapi_live_..."
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-rose-500 focus:outline-none text-zinc-900 dark:text-white font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                    Public Key (WebRTC) *
                                  </label>
                                  <input
                                    type="text"
                                    value={prov.publicKey || ""}
                                    onChange={(e) => updateVapiProvider(prov.id, { publicKey: e.target.value })}
                                    placeholder="From Vapi Dashboard"
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-rose-500 focus:outline-none text-zinc-900 dark:text-white font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                    Assistant ID (Auto-fills on Test)
                                  </label>
                                  <input
                                    type="text"
                                    value={prov.assistantId || ""}
                                    onChange={(e) => updateVapiProvider(prov.id, { assistantId: e.target.value })}
                                    placeholder="Auto-provisioned on Test"
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-rose-500 focus:outline-none text-zinc-900 dark:text-white font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                    Phone Number ID (Optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={prov.phoneNumberId || ""}
                                    onChange={(e) => updateVapiProvider(prov.id, { phoneNumberId: e.target.value })}
                                    placeholder="For PSTN direct dial"
                                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-rose-500 focus:outline-none text-zinc-900 dark:text-white font-mono"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
                                <button
                                  type="button"
                                  onClick={() => handleTestVapi(prov.id, prov.apiKey, prov.assistantId, prov.startingCredit || ((prov.name || "").toLowerCase().includes("5") ? 5 : 10))}
                                  disabled={!prov.apiKey || result?.testing}
                                  className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
                                >
                                  {result?.testing ? (
                                    <>
                                      <RefreshCw size={11} className="animate-spin text-rose-500" />
                                      Validating Key...
                                    </>
                                  ) : (
                                    <>
                                      <PhoneCall size={11} className="text-rose-500" />
                                      Test Vapi Key
                                    </>
                                  )}
                                </button>

                                {result && !result.testing && (
                                  <span className={`text-[11px] font-bold flex items-center gap-1 ${
                                    result.success ? "text-emerald-500" : "text-red-500"
                                  }`}>
                                    {result.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                    {result.message}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
