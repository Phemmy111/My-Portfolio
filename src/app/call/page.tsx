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
  Send,
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
    phone?: string;
  } | null>(null);

  const [callStatus, setCallStatus] = useState<
    "idle" | "loading" | "connecting" | "active" | "ended" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [callDuration, setCallDuration] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [textFallbackInput, setTextFallbackInput] = useState("");
  const [supportsSpeechRec, setSupportsSpeechRec] = useState(true);

  // Audio & Speech refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const isCallActiveRef = useRef<boolean>(false);
  const transcriptsRef = useRef<TranscriptMessage[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep transcriptsRef synchronized
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  // Check browser speech recognition support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRec =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        setSupportsSpeechRec(false);
      }
    }
  }, []);

  // Fetch workspace details if biz param provided
  useEffect(() => {
    let effectiveBiz = rawBiz;
    if (!effectiveBiz && typeof window !== "undefined") {
      try {
        const savedBiz =
          localStorage.getItem("obey_current_workspace") ||
          localStorage.getItem("current_workspace_slug");
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
              phone: data.workspace.owner_phone,
            });
          }
        })
        .catch((err) => console.warn("Failed to fetch workspace branding:", err));
    }
  }, [rawBiz]);

  // Initialize phone/name from localStorage
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, []);

  const stopAllMedia = () => {
    isCallActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    // Stop Speech Synthesis
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // Stop Microphone Stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    setIsListening(false);
    setIsSpeaking(false);
    setIsThinking(false);
    setVolumeLevel(0);
  };

  // Setup real-time audio volume visualizer
  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const renderVolume = () => {
        if (!isCallActiveRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, avg / 90);
        setVolumeLevel(normalized);

        animFrameRef.current = requestAnimationFrame(renderVolume);
      };

      renderVolume();
    } catch (err) {
      console.warn("Audio visualizer setup error:", err);
    }
  };

  // Speak aloud using browser SpeechSynthesis
  const speakAIspeech = (text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      if (onDone) onDone();
      return;
    }

    window.speechSynthesis.cancel();

    // Clean any remaining markdown characters for flawless voice pronunciation
    const cleanSpoken = text
      .replace(/[*#_~`[\]()]/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim();

    if (!cleanSpoken) {
      if (onDone) onDone();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanSpoken);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    currentUtteranceRef.current = utterance;

    // Select the best natural-sounding English voice
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Daniel") ||
            v.name.includes("Samantha") ||
            v.name.includes("Arthur"))
      ) || voices.find((v) => v.lang.startsWith("en"));

    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsListening(false);
    };

    const handleFinish = () => {
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
      if (isCallActiveRef.current && onDone) {
        onDone();
      }
    };

    utterance.onend = handleFinish;
    utterance.onerror = (e) => {
      console.warn("Speech synthesis notice:", e);
      handleFinish();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Start speech recognition listening loop
  const startSpeechRecognitionLoop = () => {
    if (!isCallActiveRef.current) return;

    const SpeechRecClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecClass) {
      setSupportsSpeechRec(false);
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let accumulatedFinal = "";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        if (!isCallActiveRef.current) return;

        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            accumulatedFinal += " " + trans;
          } else {
            interim += trans;
          }
        }

        const candidateText = (accumulatedFinal + " " + interim).trim();

        // Clear previous silence timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // When user pauses speaking for 1.4 seconds, trigger Obey AI thinking
        if (candidateText.length >= 2) {
          silenceTimerRef.current = setTimeout(() => {
            if (isCallActiveRef.current && candidateText.trim().length >= 2) {
              const statementToSend = candidateText.trim();
              accumulatedFinal = "";
              try {
                recognition.stop();
              } catch {}
              processUserVoiceStatement(statementToSend);
            }
          }, 1400);
        }
      };

      recognition.onerror = (event: any) => {
        // Ignore "no-speech" or "aborted" as they are normal during pauses
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Speech recognition notice:", event.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Automatically restart listening if call is active and Obey is not speaking or thinking
        if (
          isCallActiveRef.current &&
          !isSpeaking &&
          !isThinking &&
          !isMuted
        ) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Speech recognition loop error:", err);
    }
  };

  // Process user speech statement: send to /api/obey/calls/talk and speak reply
  const processUserVoiceStatement = async (userText: string) => {
    if (!userText.trim() || !isCallActiveRef.current) return;

    // 1. Add user statement to transcript
    setTranscripts((prev) => [...prev, { role: "user", text: userText }]);
    setIsThinking(true);
    setIsListening(false);

    try {
      const res = await fetch("/api/obey/calls/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: transcriptsRef.current.slice(-6),
          bizSlug: bizInfo?.slug || rawBiz,
          userName: inputName || "Friend",
          userPhone: inputPhone,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "I hear you clearly! Please go ahead.";

      if (!isCallActiveRef.current) return;

      // 2. Add assistant statement to transcript
      setTranscripts((prev) => [...prev, { role: "assistant", text: reply }]);
      setIsThinking(false);

      // 3. Speak reply aloud, then resume listening
      speakAIspeech(reply, () => {
        if (isCallActiveRef.current && !isMuted) {
          startSpeechRecognitionLoop();
        }
      });
    } catch (err) {
      console.error("AI Talk error:", err);
      setIsThinking(false);
      const fallbackReply =
        "I got your point. Let's keep going, what else can I assist you with?";
      setTranscripts((prev) => [
        ...prev,
        { role: "assistant", text: fallbackReply },
      ]);
      speakAIspeech(fallbackReply, () => {
        if (isCallActiveRef.current && !isMuted) {
          startSpeechRecognitionLoop();
        }
      });
    }
  };

  // Start Call Handler
  const startCall = async (overridePhone?: string, overrideName?: string) => {
    stopAllMedia();

    const effectivePhone =
      overridePhone !== undefined ? overridePhone : inputPhone;
    const effectiveName =
      overrideName !== undefined ? overrideName : inputName;

    // Prompt for phone if empty
    if (!effectivePhone && !showPhoneModal && callStatus === "idle") {
      setShowPhoneModal(true);
      return;
    }
    setShowPhoneModal(false);

    try {
      setCallStatus("connecting");
      setErrorMessage(null);
      isCallActiveRef.current = true;

      // 1. Request microphone access
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
      } catch (micErr: any) {
        console.warn("Microphone access error:", micErr);
        setErrorMessage(
          "Microphone permission was not granted. Please allow microphone access in your browser to speak with Obey."
        );
        setCallStatus("error");
        isCallActiveRef.current = false;
        return;
      }

      // 2. Setup audio frequency visualizer for the glowing orb
      setupAudioVisualizer(stream);

      // 3. Set call active
      setCallStatus("active");
      setCallDuration(0);
      setTranscripts([]);

      // 4. Fetch customized voice greeting from server
      let initialGreeting = bizInfo?.greeting;
      if (!initialGreeting) {
        try {
          const greetRes = await fetch("/api/obey/calls/talk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isGreeting: true,
              bizSlug: bizInfo?.slug || rawBiz,
              userName: effectiveName || "Friend",
            }),
          });
          const greetData = await greetRes.json();
          if (greetData.reply) {
            initialGreeting = greetData.reply;
          }
        } catch {}
      }

      if (!initialGreeting) {
        initialGreeting = bizInfo?.name
          ? `Hello ${effectiveName || "there"}! I am Obey, the AI voice assistant for ${bizInfo.name}. How can I help you today?`
          : `Hello ${effectiveName || "Friend"}! Great to connect with you today! I am Obey, your AI companion. What is on your mind?`;
      }

      // 5. Add greeting to transcripts & speak aloud
      setTranscripts([{ role: "assistant", text: initialGreeting }]);
      speakAIspeech(initialGreeting, () => {
        if (isCallActiveRef.current && !isMuted) {
          startSpeechRecognitionLoop();
        }
      });
    } catch (err: any) {
      console.error("Failed to start voice call:", err);
      setErrorMessage(
        err.message || "Could not connect to voice audio. Please retry."
      );
      setCallStatus("error");
      stopAllMedia();
    }
  };

  // End Call Handler
  const endCall = async () => {
    const finalTranscripts = [...transcriptsRef.current];
    const finalDuration = callDuration;

    stopAllMedia();
    setCallStatus("ended");

    // Asynchronously dispatch WhatsApp summary report
    try {
      fetch("/api/obey/calls/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEndReport: true,
          history: finalTranscripts,
          durationSeconds: finalDuration,
          bizSlug: bizInfo?.slug || rawBiz,
          userName: inputName || "Friend",
          userPhone: inputPhone,
        }),
      }).catch(() => {});
    } catch {}
  };

  // Mute / Unmute Toggle
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (nextMuted) {
      // Mute: stop recognition & speech
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsListening(false);
      setIsSpeaking(false);
    } else {
      // Unmute: resume listening
      if (isCallActiveRef.current && !isSpeaking && !isThinking) {
        startSpeechRecognitionLoop();
      }
    }
  };

  // Format timer MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Text fallback statement submission
  const handleSendTextFallback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textFallbackInput.trim() || !isCallActiveRef.current) return;
    const msg = textFallbackInput.trim();
    setTextFallbackInput("");
    processUserVoiceStatement(msg);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-all"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back to Portfolio</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-emerald-500/50 shrink-0">
            <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
            Obey Free Voice Engine
          </span>
          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            100% Free
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span className="hidden sm:inline">Encrypted Audio</span>
        </div>
      </header>

      {/* Main Center Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-xl mx-auto w-full text-center">
        {/* User Greeting & Status Indicator */}
        <div className="mb-4 sm:mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300">
            <div className="relative w-4 h-4 rounded-full overflow-hidden border border-emerald-500/40 shrink-0">
              <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
            </div>
            <span>
              {bizInfo?.name
                ? `${bizInfo.name} AI Hotline`
                : "Femi Adeleke's AI Voice Assistant"}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {bizInfo?.name
              ? `${bizInfo.name} Voice Hotline`
              : rawName
              ? `Speaking with ${rawName}`
              : "Voice Call with Obey"}
          </h1>

          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {callStatus === "idle" &&
              "Tap the microphone below to begin your completely free live voice call."}
            {callStatus === "connecting" &&
              "Connecting to Obey Free Voice Engine..."}
            {callStatus === "active" &&
              (isSpeaking
                ? "🎙️ Obey is speaking..."
                : isThinking
                ? "🧠 Obey is thinking..."
                : isMuted
                ? "🔇 Call is muted"
                : "👂 Obey is listening to you...")}
            {callStatus === "ended" &&
              "Call ended. Executive transcript dispatched to your WhatsApp."}
            {callStatus === "error" &&
              (errorMessage || "Voice connection paused.")}
          </p>
        </div>

        {/* Pulsing Visualizer Orb with Obey Logo */}
        <div className="relative my-6 sm:my-8 flex items-center justify-center">
          {/* Outer Pulsing Rings */}
          {callStatus === "active" && (
            <>
              <div
                className={`absolute rounded-full blur-2xl transition-all duration-150 ${
                  isSpeaking
                    ? "bg-emerald-500/40"
                    : isThinking
                    ? "bg-purple-500/30"
                    : "bg-teal-500/25"
                }`}
                style={{
                  width: `${180 + volumeLevel * 140}px`,
                  height: `${180 + volumeLevel * 140}px`,
                }}
              />
              <div
                className={`absolute rounded-full border transition-all duration-150 animate-ping ${
                  isSpeaking
                    ? "border-emerald-500/40"
                    : isThinking
                    ? "border-purple-500/40"
                    : "border-teal-500/30"
                }`}
                style={{
                  width: `${145 + volumeLevel * 80}px`,
                  height: `${145 + volumeLevel * 80}px`,
                }}
              />
            </>
          )}

          {callStatus === "connecting" && (
            <div className="absolute w-44 h-44 rounded-full border-2 border-dashed border-emerald-500/60 animate-spin [animation-duration:10s]" />
          )}

          {/* Central Orb with Obey Logo */}
          <div
            className={`relative w-36 h-36 sm:w-40 sm:h-40 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl overflow-hidden p-1.5 ${
              callStatus === "active"
                ? isSpeaking
                  ? "ring-4 ring-emerald-500 shadow-emerald-500/50 scale-105"
                  : isThinking
                  ? "ring-4 ring-purple-500 shadow-purple-500/40 animate-pulse"
                  : "ring-2 ring-teal-500 shadow-teal-500/40 scale-100"
                : callStatus === "connecting"
                ? "ring-4 ring-emerald-500/80 animate-pulse"
                : callStatus === "ended"
                ? "ring-2 ring-zinc-700 opacity-80"
                : "ring-2 ring-zinc-700 hover:ring-emerald-500 transition-all shadow-zinc-950/80 hover:scale-105"
            }`}
          >
            <div className="relative w-full h-full rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center">
              <img
                src="/obey-logo.jpg"
                alt="Obey AI"
                className={`w-full h-full object-cover transition-transform duration-500 ${
                  callStatus === "active" && (isSpeaking || isThinking)
                    ? "scale-110"
                    : "scale-100"
                }`}
              />

              {/* Status Duration Badge */}
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
                  <RefreshCw size={32} className="text-emerald-400 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Conversation Transcript Preview */}
        {transcripts.length > 0 && (
          <div className="w-full max-h-36 overflow-y-auto mb-5 p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-500 tracking-wider">
              <div className="flex items-center gap-1.5">
                <MessageSquare size={12} />
                <span>Live Spoken Transcript</span>
              </div>
              <span className="text-emerald-400 font-bold">100% Free Voice</span>
            </div>
            {transcripts.slice(-3).map((t, idx) => (
              <p key={idx} className="text-xs leading-relaxed">
                <span
                  className={`font-black ${
                    t.role === "assistant" ? "text-emerald-400" : "text-amber-300"
                  }`}
                >
                  {t.role === "assistant" ? "Obey: " : "You: "}
                </span>
                <span className="text-zinc-300">{t.text}</span>
              </p>
            ))}
          </div>
        )}

        {/* Active Call In-Browser Text Input Fallback (for noisy rooms or older browsers) */}
        {callStatus === "active" && (
          <form
            onSubmit={handleSendTextFallback}
            className="w-full max-w-md mx-auto mb-4 flex items-center gap-2"
          >
            <input
              type="text"
              value={textFallbackInput}
              onChange={(e) => setTextFallbackInput(e.target.value)}
              placeholder="Or type anything here to talk..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!textFallbackInput.trim()}
              className="p-2 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 transition cursor-pointer"
              title="Send spoken message"
            >
              <Send size={15} />
            </button>
          </form>
        )}

        {/* Pre-Call Setup: WhatsApp Number & Name for Instant Report Delivery */}
        {callStatus === "idle" && (
          <div className="w-full max-w-md mx-auto mb-6 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-left space-y-3 shadow-xl">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-emerald-400" />
              <span className="text-xs font-bold text-zinc-200">
                Receive Summary on WhatsApp (Optional)
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Enter your WhatsApp number so Obey can deliver the executive transcript and action points immediately after the call.
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
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer ${
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
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all hover:scale-105 cursor-pointer"
                title="End Call"
              >
                <PhoneOff size={26} />
              </button>
            </>
          ) : callStatus === "connecting" ? (
            <button
              type="button"
              onClick={endCall}
              className="px-6 py-3 rounded-2xl bg-zinc-800 text-zinc-400 font-bold text-xs hover:bg-zinc-700 hover:text-white transition-all cursor-pointer"
            >
              Cancel Connection
            </button>
          ) : callStatus === "ended" ? (
            <button
              type="button"
              onClick={() => startCall()}
              className="px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 cursor-pointer"
            >
              <PhoneCall size={18} />
              <span>Start New Call</span>
            </button>
          ) : callStatus === "error" ? (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => startCall()}
                className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 cursor-pointer"
              >
                <RefreshCw size={17} />
                <span>Retry Free Voice Call</span>
              </button>
              <a
                href={`https://wa.me/${(bizInfo?.phone || "2348120934828").replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Hi! I tried calling you on the ${bizInfo?.name || "Obey"} Voice Hotline.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-bold text-sm flex items-center gap-2 border border-emerald-500/30 transition-all hover:scale-105"
              >
                <MessageSquare size={17} />
                <span>Chat on WhatsApp</span>
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startCall()}
              className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm flex items-center gap-2.5 shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 cursor-pointer"
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
                ? `The summary transcript is being sent to your WhatsApp (+${inputPhone || rawPhone}) and Femi Adeleke.`
                : `The call summary has been archived and dispatched to Femi Adeleke.`}
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
                  <h3 className="text-sm font-black text-white">Receive Your Call Summary</h3>
                  <p className="text-[11px] text-zinc-400">Action items sent directly to WhatsApp</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Enter your WhatsApp number so Obey can send you your complete executive transcript right after the call!
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
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] cursor-pointer"
                >
                  <PhoneCall size={14} />
                  <span>Connect & Send Summary</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startCall("", modalName || inputName || "Friend");
                  }}
                  className="w-full py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Continue without WhatsApp Delivery
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="px-6 py-4 text-center border-t border-zinc-900 text-zinc-500 text-xs flex items-center justify-center gap-2">
        <Sparkles size={14} className="text-emerald-500" />
        <span>Powered by Obey Native Voice Engine · 100% Free Forever</span>
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
