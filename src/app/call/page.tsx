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

  const startCall = async () => {
    if (!vapiConfig) {
      setErrorMessage("Voice service not ready. Please wait a moment.");
      return;
    }

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
          setErrorMessage(err.message || "Voice connection interrupted.");
          setCallStatus("error");
        });
      }

      const userPhone = rawPhone.replace(/\D/g, "") || "2348120934828";
      const userName = rawName || "Friend";

      await vapiRef.current.start(vapiConfig.assistantId, {
        metadata: {
          userPhone,
          userName,
          channel: "webrtc_web",
        },
        variableValues: {
          userPhone,
          userName,
        },
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
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
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
            <Bot size={14} className="text-emerald-400" />
            <span>Femi Adeleke&apos;s AI Assistant</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {rawName ? `Speaking with ${rawName}` : "Voice Call with Obey"}
          </h1>

          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {callStatus === "idle" && "Tap the microphone below to begin your free live voice conversation."}
            {callStatus === "connecting" && "Establishing high-definition WebRTC connection..."}
            {callStatus === "active" && (isSpeaking ? "Obey is speaking..." : "Obey is listening to you...")}
            {callStatus === "ended" && "Call completed. Summary and recording have been saved."}
            {callStatus === "error" && (errorMessage || "Connection error occurred.")}
          </p>
        </div>

        {/* Pulsing Visualizer Orb */}
        <div className="relative my-8 flex items-center justify-center">
          {/* Outer Pulsing Rings */}
          {callStatus === "active" && (
            <>
              <div
                className="absolute rounded-full bg-rose-500/20 blur-xl transition-all duration-100"
                style={{
                  width: `${180 + volumeLevel * 140}px`,
                  height: `${180 + volumeLevel * 140}px`,
                }}
              />
              <div
                className="absolute rounded-full border border-rose-500/30 transition-all duration-150 animate-ping"
                style={{
                  width: `${140 + volumeLevel * 80}px`,
                  height: `${140 + volumeLevel * 80}px`,
                }}
              />
            </>
          )}

          {/* Central Orb */}
          <div
            className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
              callStatus === "active"
                ? isSpeaking
                  ? "bg-gradient-to-tr from-rose-600 via-amber-500 to-emerald-400 shadow-rose-500/50 scale-105"
                  : "bg-gradient-to-tr from-emerald-600 via-teal-500 to-blue-500 shadow-emerald-500/50 scale-100"
                : callStatus === "connecting"
                ? "bg-gradient-to-tr from-amber-600 to-rose-600 animate-pulse shadow-amber-500/30"
                : callStatus === "ended"
                ? "bg-zinc-800 border border-zinc-700"
                : "bg-gradient-to-tr from-zinc-800 to-zinc-900 border border-zinc-700 hover:border-zinc-500"
            }`}
          >
            {callStatus === "active" ? (
              <div className="flex flex-col items-center gap-1">
                <Volume2 size={36} className="text-white animate-bounce" />
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-white/90">
                  {formatTimer(callDuration)}
                </span>
              </div>
            ) : callStatus === "connecting" ? (
              <RefreshCw size={36} className="text-white animate-spin" />
            ) : (
              <Mic size={36} className="text-zinc-400" />
            )}
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
              onClick={startCall}
              className="px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105"
            >
              <PhoneCall size={18} />
              <span>Start New Call</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startCall}
              disabled={!vapiConfig}
              className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2.5 shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 disabled:opacity-50"
            >
              <PhoneCall size={20} />
              <span>Start Voice Call with Obey</span>
            </button>
          )}
        </div>

        {rawPhone && callStatus === "ended" && (
          <p className="mt-4 text-[11px] text-zinc-500">
            💬 A summary & audio recording are being processed for WhatsApp number:{" "}
            <span className="text-zinc-300 font-mono">+{rawPhone}</span>
          </p>
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
