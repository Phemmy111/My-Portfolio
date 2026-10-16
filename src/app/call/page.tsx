"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  Volume2,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  MessageSquare,
  Bot,
} from "lucide-react";
import Link from "next/link";

interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
}

function CallInterface() {
  const searchParams = useSearchParams();
  const rawPhone = searchParams.get("phone") || "";
  const rawName = searchParams.get("name") || "";
  const rawBiz = searchParams.get("biz") || searchParams.get("workspace") || "";

  const [inputPhone, setInputPhone] = useState(rawPhone || "");
  const [inputName, setInputName] = useState(rawName || "");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [modalPhone, setModalPhone] = useState(rawPhone || "");
  const [modalName, setModalName] = useState(rawName || "");
  const [bizInfo, setBizInfo] = useState<{
    name: string;
    slug: string;
    greeting?: string;
  } | null>(null);

  const [callStatus, setCallStatus] = useState<
    "idle" | "loading" | "connecting" | "active" | "ended" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [vapiConfig, setVapiConfig] = useState<{ publicKey: string; assistantId: string } | null>(null);

  const vapiRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch workspace details if biz param provided or saved in localStorage
  useEffect(() => {
    let effectiveBiz = rawBiz;
    if (!effectiveBiz && typeof window !== "undefined") {
      try {
        const savedBiz = localStorage.getItem("obey_current_workspace") || localStorage.getItem("current_workspace_slug");
        if (savedBiz && savedBiz !== "femi" && savedBiz !== "femi-adeleke") {
          effectiveBiz = savedBiz;
        }
      } catch {}
    }

    if (effectiveBiz) {
      fetch(`/api/obey/workspaces/${effectiveBiz}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.workspace) {
            setBizInfo({
              name: data.workspace.name,
              slug: data.workspace.slug,
              greeting: data.settings?.voice_greeting,
            });
          }
        })
        .catch((err) => console.warn("Failed to fetch workspace branding:", err));
    }
  }, [rawBiz]);

  // Initialize from localStorage if query params were empty
  useEffect(() => {
    try {
      if (rawPhone) {
        localStorage.setItem("obey_call_phone", rawPhone);
      } else {
        const savedPhone = localStorage.getItem("obey_call_phone");
        if (savedPhone) {
          setInputPhone(savedPhone);
          setModalPhone(savedPhone);
        }
      }
      if (rawName) {
        localStorage.setItem("obey_call_name", rawName);
      } else {
        const savedName = localStorage.getItem("obey_call_name");
        if (savedName) {
          setInputName(savedName);
          setModalName(savedName);
        }
      }
    } catch {}
  }, [rawPhone, rawName]);

  // Fetch Vapi configuration
  useEffect(() => {
    fetch("/api/obey/calls/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.publicKey && data.assistantId) {
          setVapiConfig(data);
        } else {
          setErrorMessage("Vapi Voice configuration is missing.");
          setCallStatus("error");
        }
      })
      .catch((err) => {
        console.error("Config fetch error:", err);
        setErrorMessage("Could not connect to voice service.");
        setCallStatus("error");
      });
  }, []);

  // Call duration counter
  useEffect(() => {
    if (callStatus === "active") {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (callStatus === "idle") setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  const startCall = async (overridePhone?: string, overrideName?: string) => {
    if (!vapiConfig) {
      setErrorMessage("Voice service not ready. Please wait a moment.");
      return;
    }

    const effectiveRawPhone = overridePhone !== undefined ? overridePhone : (inputPhone || rawPhone || "");
    const effectiveRawName = overrideName !== undefined ? overrideName : (inputName || rawName || "");

    let cleanPhone = effectiveRawPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
      cleanPhone = "234" + cleanPhone.slice(1);
    }
    const userPhone = cleanPhone.length >= 10 ? cleanPhone : "";
    const userName = effectiveRawName.trim() || "Friend";

    // If caller hasn't entered a phone number and overridePhone wasn't explicitly provided, show modal prompt
    if (!userPhone && overridePhone === undefined) {
      setModalPhone(inputPhone || "");
      setModalName(inputName || "");
      setShowPhoneModal(true);
      return;
    }

    setShowPhoneModal(false);

    try {
      setCallStatus("connecting");
      setErrorMessage(null);

      // Dynamically import @vapi-ai/web to prevent SSR issues
      const { default: Vapi } = await import("@vapi-ai/web");

      if (!vapiRef.current) {
        vapiRef.current = new Vapi(vapiConfig.publicKey);

        vapiRef.current.on("call-start", () => {
          setCallStatus("active");
          setCallDuration(0);
        });

        vapiRef.current.on("call-end", () => {
          setCallStatus("ended");
          setIsSpeaking(false);
          setVolumeLevel(0);
        });

        vapiRef.current.on("speech-start", () => {
          setIsSpeaking(true);
        });

        vapiRef.current.on("speech-end", () => {
          setIsSpeaking(false);
        });

        vapiRef.current.on("volume-level", (volume: number) => {
          setVolumeLevel(volume);
        });

        vapiRef.current.on("message", (msg: any) => {
          if (msg.type === "transcript" && msg.transcript) {
            const role = msg.role === "assistant" ? "assistant" : "user";
            setTranscripts((prev) => {
              // Update last or append
              if (prev.length > 0 && prev[prev.length - 1].role === role) {
                const next = [...prev];
                next[next.length - 1].text = msg.transcript;
                return next;
              }
              return [...prev, { role, text: msg.transcript }];
            });
          }
        });

        vapiRef.current.on("error", (err: any) => {
          console.error("Vapi call error:", err);
          const rawErr = err?.error?.message || err?.message || (typeof err === "string" ? err : "");
          if (rawErr.toLowerCase().includes("audio") || rawErr.toLowerCase().includes("microphone") || !rawErr) {
            setErrorMessage("Voice connection paused. Tap 'Start Voice Call' below to resume speaking with Obey.");
          } else {
            setErrorMessage(rawErr);
          }
          setCallStatus("error");
        });
      }

      // Resume AudioContext on mobile devices (required for iOS Safari and Android Chrome)
      try {
        if (typeof window !== "undefined") {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            if (ctx.state === "suspended") {
              await ctx.resume().catch(() => {});
            }
          }
        }
      } catch {}

      // Ensure microphone permission without pre-killing the track on mobile
      try {
        if (typeof navigator !== "undefined" && navigator?.mediaDevices?.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } catch (micErr: any) {
        console.warn("[Call] Microphone permission issue:", micErr);
        setErrorMessage("Microphone permission was denied. Please allow microphone access in your browser to speak with Obey.");
        setCallStatus("error");
        return;
      }

      if (userPhone) {
        try {
          localStorage.setItem("obey_call_phone", userPhone);
          if (userName && userName !== "Friend") localStorage.setItem("obey_call_name", userName);
        } catch {}
      }

      await vapiRef.current.start(vapiConfig.assistantId, {
        metadata: {
          userPhone,
          userName,
          channel: "webrtc_web",
          workspaceSlug: bizInfo?.slug || "femi-adeleke",
        },
        variableValues: {
          userPhone,
          userName,
          businessName: bizInfo?.name || "Femi Adeleke",
        },
        assistantOverrides: bizInfo?.greeting
          ? {
              firstMessage: bizInfo.greeting,
            }
          : undefined,
      });
    } catch (err: any) {
      console.error("Failed to start call:", err);
      setErrorMessage(
        err.message || "Microphone access denied or connection failed. Please allow microphone permissions."
      );
      setCallStatus("error");
    }
  };

  const endCall = () => {
    if (vapiRef.current) {
      try {
        vapiRef.current.stop();
      } catch (err) {
        console.error("Error stopping call:", err);
      }
    }
    setCallStatus("ended");
    setIsSpeaking(false);
    setVolumeLevel(0);
  };

  const toggleMute = () => {
    if (vapiRef.current && callStatus === "active") {
      const nextMuted = !isMuted;
      try {
        vapiRef.current.setMuted(nextMuted);
        setIsMuted(nextMuted);
      } catch (err) {
        console.error("Mute toggle error:", err);
      }
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-all"
        >
          <ArrowLeft size={16} />
          <span>Back to Portfolio</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-emerald-500/50 shrink-0">
            <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
            Obey WebRTC Voice Gateway
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Encrypted Voice</span>
        </div>
      </header>

      {/* Main Center Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-xl mx-auto w-full text-center">
        {/* User Greeting & Status Indicator */}
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300">
            <div className="relative w-4 h-4 rounded-full overflow-hidden border border-emerald-500/40 shrink-0">
              <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
            </div>
            <span>{bizInfo?.name ? `${bizInfo.name} AI Hotline` : "Femi Adeleke's AI Assistant"}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {bizInfo?.name
              ? `${bizInfo.name} Voice Hotline`
              : rawName
              ? `Speaking with ${rawName}`
              : "Voice Call with Obey"}
          </h1>

          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {callStatus === "idle" && "Tap the microphone below to begin your free live voice conversation."}
            {callStatus === "connecting" && "Establishing high-definition WebRTC connection..."}
            {callStatus === "active" && (isSpeaking ? "Obey is speaking..." : "Obey is listening to you...")}
            {callStatus === "ended" && "Call completed. Summary and recording have been saved."}
            {callStatus === "error" && (errorMessage || "Connection error occurred.")}
          </p>
        </div>

        {/* Pulsing Visualizer Orb with Obey Logo */}
        <div className="relative my-8 flex items-center justify-center">
          {/* Outer Pulsing Rings */}
          {callStatus === "active" && (
            <>
              <div
                className={`absolute rounded-full blur-2xl transition-all duration-150 ${
                  isSpeaking ? "bg-emerald-500/30" : "bg-teal-500/20"
                }`}
                style={{
                  width: `${190 + volumeLevel * 140}px`,
                  height: `${190 + volumeLevel * 140}px`,
                }}
              />
              <div
                className={`absolute rounded-full border transition-all duration-150 animate-ping ${
                  isSpeaking ? "border-emerald-500/40" : "border-teal-500/30"
                }`}
                style={{
                  width: `${150 + volumeLevel * 80}px`,
                  height: `${150 + volumeLevel * 80}px`,
                }}
              />
            </>
          )}

          {callStatus === "connecting" && (
            <div className="absolute w-44 h-44 rounded-full border-2 border-dashed border-amber-500/60 animate-spin [animation-duration:10s]" />
          )}

          {/* Central Orb with Obey Logo */}
          <div
            className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl overflow-hidden p-1.5 ${
              callStatus === "active"
                ? isSpeaking
                  ? "ring-4 ring-emerald-500 shadow-emerald-500/50 scale-105"
                  : "ring-2 ring-teal-500 shadow-teal-500/40 scale-100"
                : callStatus === "connecting"
                ? "ring-4 ring-amber-500/80 animate-pulse shadow-amber-500/30"
                : callStatus === "ended"
                ? "ring-2 ring-zinc-700 opacity-80"
                : "ring-2 ring-zinc-700 hover:ring-emerald-500 transition-all shadow-zinc-950/80 hover:scale-105"
            }`}
          >
            {/* Obey Logo Image */}
            <div className="relative w-full h-full rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center">
              <img
                src="/obey-logo.jpg"
                alt="Obey AI"
                className={`w-full h-full object-cover transition-transform duration-500 ${
                  callStatus === "active" && isSpeaking ? "scale-110" : "scale-100"
                }`}
              />

              {/* Status Overlay Badge */}
              {callStatus === "active" && (
                <div className="absolute inset-x-0 bottom-0 py-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center justify-end">
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/30 backdrop-blur-md border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider text-emerald-200">
                      {formatTimer(callDuration)}
                    </span>
                  </div>
                </div>
              )}

              {callStatus === "connecting" && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                  <RefreshCw size={32} className="text-amber-400 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Conversation Transcript Preview */}
        {transcripts.length > 0 && (
          <div className="w-full max-h-36 overflow-y-auto mb-6 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-zinc-500 tracking-wider">
              <MessageSquare size={12} />
              <span>Live Transcript</span>
            </div>
            {transcripts.slice(-3).map((t, idx) => (
              <p key={idx} className="text-xs leading-relaxed">
                <span
                  className={`font-black ${
                    t.role === "assistant" ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {t.role === "assistant" ? "Obey: " : "You: "}
                </span>
                <span className="text-zinc-300">{t.text}</span>
              </p>
            ))}
          </div>
        )}

        {/* Pre-Call Setup: WhatsApp Number & Name for Instant Report Delivery */}
        {callStatus === "idle" && (
          <div className="w-full max-w-md mx-auto mb-6 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-left space-y-3 shadow-xl">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-zinc-200">Get Your Call Recording on WhatsApp</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Enter your WhatsApp number so Obey can send you your audio recording, transcript, and executive summary immediately after the call.
            </p>
            <div className="space-y-2">
              <input
                type="tel"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                placeholder="WhatsApp Number (e.g. +234 812 093 4828 or 080...)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Your Name (Optional, e.g. Tunde)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4">
          {callStatus === "active" ? (
            <>
              {/* Mute Button */}
              <button
                type="button"
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isMuted
                    ? "bg-amber-500/20 border border-amber-500 text-amber-400 hover:bg-amber-500/30"
                    : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all hover:scale-105"
                title="End Call"
              >
                <PhoneOff size={26} />
              </button>
            </>
          ) : callStatus === "connecting" ? (
            <button
              type="button"
              onClick={endCall}
              className="px-6 py-3 rounded-2xl bg-zinc-800 text-zinc-400 font-bold text-xs hover:bg-zinc-700 hover:text-white transition-all"
            >
              Cancel Connection
            </button>
          ) : callStatus === "ended" ? (
            <button
              type="button"
              onClick={() => startCall()}
              className="px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105"
            >
              <PhoneCall size={18} />
              <span>Start New Call</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startCall()}
              disabled={!vapiConfig}
              className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2.5 shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 disabled:opacity-50"
            >
              <PhoneCall size={20} />
              <span>Start Voice Call with Obey</span>
            </button>
          )}
        </div>

        {callStatus === "ended" && (
          <div className="mt-4 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-center max-w-md mx-auto space-y-1">
            <p className="text-xs font-bold text-emerald-400">
              🎙️ Call Completed & Dispatched
            </p>
            <p className="text-[11px] text-zinc-400">
              {inputPhone || rawPhone
                ? `The summary transcript & audio recording are being sent to your WhatsApp (+${inputPhone || rawPhone}) and Femi Adeleke.`
                : `The call summary and recording have been archived and dispatched to Femi Adeleke.`}
            </p>
          </div>
        )}

        {/* Modal for Prompting WhatsApp Number before connecting */}
        {showPhoneModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 text-left shadow-2xl space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Receive Your Call Recording</h3>
                  <p className="text-[11px] text-zinc-400">Audio note & summary sent to WhatsApp</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Enter your WhatsApp number so Obey can send you your audio voice note and complete executive transcript right after the call!
              </p>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    WhatsApp Phone Number
                  </label>
                  <input
                    type="tel"
                    autoFocus
                    value={modalPhone}
                    onChange={(e) => setModalPhone(e.target.value)}
                    placeholder="e.g. 08120934828 or +234..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    placeholder="e.g. Fadesewa"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputPhone(modalPhone);
                    setInputName(modalName);
                    startCall(modalPhone, modalName);
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                >
                  <PhoneCall size={14} />
                  <span>Connect & Send Recording</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startCall("", modalName || inputName || "Friend");
                  }}
                  className="w-full py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs transition-all"
                >
                  Continue without WhatsApp Delivery
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="px-6 py-4 text-center border-t border-zinc-900 text-zinc-600 text-xs flex items-center justify-center gap-2">
        <Sparkles size={14} className="text-amber-500" />
        <span>Powered by Obey AI & Vapi WebRTC · 100% Free Live Voice</span>
      </footer>
    </div>
  );
}

export default function VoiceCallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          <RefreshCw size={24} className="animate-spin text-emerald-500" />
        </div>
      }
    >
      <CallInterface />
    </Suspense>
  );
}
