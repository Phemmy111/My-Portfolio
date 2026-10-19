"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  Volume2,
  VolumeX,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  MessageSquare,
  Bot,
  Send,
  Sliders,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const VOICE_PROFILES: Record<
  string,
  {
    name: string;
    flag: string;
    gender: "male" | "female";
    lang: string;
    pitch: number;
    rate: number;
    preferredVoices: string[];
    sampleText: string;
  }
> = {
  nigerian_male: {
    name: "Nigerian Male (Executive Brother)",
    flag: "🇳🇬",
    gender: "male",
    lang: "en-NG",
    pitch: 0.82,
    rate: 0.98,
    preferredVoices: [
      "Nigerian Male",
      "Google UK English Male",
      "UK English Male",
      "David",
      "George",
      "Mark",
      "Daniel",
      "Arthur",
      "Alex",
      "Guy",
    ],
    sampleText: "Hello my brother! I am Obey, your Nigerian executive companion. How can I assist you today?",
  },
  nigerian_female: {
    name: "Nigerian Female (Warm Sister)",
    flag: "🇳🇬",
    gender: "female",
    lang: "en-NG",
    pitch: 1.05,
    rate: 1.0,
    preferredVoices: [
      "Google English (Nigeria)",
      "Nigeria",
      "en-NG",
      "Google UK English Female",
      "UK English Female",
      "Samantha",
      "Victoria",
      "Zira",
      "Jenny",
      "Aria",
    ],
    sampleText: "Hello there! I am Obey, your warm sister and personal assistant. What can I do for you?",
  },
  british_male: {
    name: "British Male (Executive & Crisp)",
    flag: "🇬🇧",
    gender: "male",
    lang: "en-GB",
    pitch: 0.88,
    rate: 1.0,
    preferredVoices: [
      "Google UK English Male",
      "UK English Male",
      "George",
      "Daniel",
      "Arthur",
      "Oliver",
      "David",
    ],
    sampleText: "Good day! I am Obey, your executive British assistant. How may I be of service to you?",
  },
  british_female: {
    name: "British Female (Polished & Refined)",
    flag: "🇬🇧",
    gender: "female",
    lang: "en-GB",
    pitch: 1.05,
    rate: 1.0,
    preferredVoices: [
      "Google UK English Female",
      "UK English Female",
      "Victoria",
      "Hazel",
      "Susan",
      "Fiona",
      "Samantha",
    ],
    sampleText: "Hello! I am Obey, your refined British assistant. I am delighted to assist you today.",
  },
  american_male: {
    name: "American Male (Silicon Valley)",
    flag: "🇺🇸",
    gender: "male",
    lang: "en-US",
    pitch: 0.88,
    rate: 1.02,
    preferredVoices: [
      "David",
      "Mark",
      "Alex",
      "Fred",
      "Ryan",
      "US English Male",
      "Google UK English Male",
    ],
    sampleText: "Hey there! I am Obey, your Silicon Valley tech assistant. What are we building today?",
  },
  american_female: {
    name: "American Female (Friendly & Dynamic)",
    flag: "🇺🇸",
    gender: "female",
    lang: "en-US",
    pitch: 1.08,
    rate: 1.02,
    preferredVoices: [
      "Google US English",
      "Samantha",
      "Zira",
      "Jenny",
      "Aria",
      "US English Female",
    ],
    sampleText: "Hi there! I am Obey, your friendly and dynamic assistant. How can I help you today?",
  },
};

export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  profile: (typeof VOICE_PROFILES)[string]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const isFemale = profile.gender === "female";

  // Known female voice identifiers across browsers & operating systems
  const femaleKeywords = [
    "female",
    "zira",
    "samantha",
    "victoria",
    "karen",
    "hazel",
    "susan",
    "catherine",
    "helena",
    "fiona",
    "jenny",
    "aria",
    "linda",
    "mary",
    "eva",
    "katja",
    "google us english", // Google US English in Chrome is a woman's voice
    "google english (nigeria)", // Google Nigerian English in Chrome/Android is a woman's voice
    "english (nigeria)",
  ];

  // Known male voice identifiers across browsers & operating systems
  const maleKeywords = [
    "male",
    "david",
    "george",
    "arthur",
    "daniel",
    "alex",
    "guy",
    "fred",
    "ryan",
    "mark",
    "richard",
    "james",
    "oliver",
    "peter",
    "brian",
    "christopher",
    "eric",
    "tom",
    "uk english male",
    "google uk english male",
  ];

  const isExcluded = (v: SpeechSynthesisVoice): boolean => {
    const str = `${v.name} ${v.voiceURI}`.toLowerCase();
    if (isFemale) {
      return maleKeywords.some((kw) => str.includes(kw));
    } else {
      return femaleKeywords.some((kw) => str.includes(kw));
    }
  };

  const isTargetGender = (v: SpeechSynthesisVoice): boolean => {
    const str = `${v.name} ${v.voiceURI}`.toLowerCase();
    const targets = isFemale ? femaleKeywords : maleKeywords;
    return targets.some((kw) => str.includes(kw));
  };

  // Strictly filter out opposite gender voices
  let cleanPool = voices.filter((v) => !isExcluded(v));
  if (cleanPool.length === 0) {
    cleanPool = voices;
  }

  // 1. Preferred names match within clean pool
  for (const pref of profile.preferredVoices) {
    const prefLower = pref.toLowerCase();
    const v = cleanPool.find((voice) => {
      const name = voice.name.toLowerCase();
      const uri = voice.voiceURI.toLowerCase();
      return name.includes(prefLower) || uri.includes(prefLower);
    });
    if (v) return v;
  }

  // 2. Any English voice with target gender keyword
  const englishGender = cleanPool.find((v) => {
    const isEn = v.lang.toLowerCase().startsWith("en");
    return isEn && isTargetGender(v);
  });
  if (englishGender) return englishGender;

  // 3. Any English voice in clean pool
  const anyEnglish = cleanPool.find((v) =>
    v.lang.toLowerCase().startsWith("en")
  );
  if (anyEnglish) return anyEnglish;

  return cleanPool[0] || voices[0] || null;
}

export const PERSONALITY_PROFILES: Record<
  string,
  {
    label: string;
    description: string;
    emoji: string;
  }
> = {
  professional: {
    label: "Professional Executive",
    description: "Sharp, articulate, executive demeanor",
    emoji: "💼",
  },
  friendly: {
    label: "Warm & Brotherly",
    description: "Supportive, uplifting, close brotherly friend vibe",
    emoji: "🤝",
  },
  nigerian_pidgin: {
    label: "Authentic Naija & Street-Smart",
    description: "Natural blend of English and authentic Pidgin ('Sharp-sharp')",
    emoji: "⚡",
  },
  direct: {
    label: "Direct & Concise",
    description: "Immediate solutions, zero fluff, straight to the point",
    emoji: "🎯",
  },
};

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
    voice_id?: string;
    voice_personality?: string;
  } | null>(null);

  const [selectedVoice, setSelectedVoice] = useState<string>("nigerian_male");
  const [selectedPersonality, setSelectedPersonality] = useState<string>("professional");
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

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
  const isSpeakingRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const isCallActiveRef = useRef<boolean>(false);
  const transcriptsRef = useRef<TranscriptMessage[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string) || "");
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  };

  // Play voice preview sample
  const previewVoice = (voiceKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (previewVoiceId === voiceKey) {
      window.speechSynthesis.cancel();
      setPreviewVoiceId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const prof = VOICE_PROFILES[voiceKey] || VOICE_PROFILES["nigerian_male"];
    const text = prof.sampleText || "Hello! I am Obey, your personal assistant.";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = prof.pitch;
    utterance.rate = prof.rate;

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = pickBestVoice(voices, prof);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onend = () => {
      setPreviewVoiceId(null);
    };
    utterance.onerror = () => {
      setPreviewVoiceId(null);
    };

    setPreviewVoiceId(voiceKey);
    window.speechSynthesis.speak(utterance);
  };

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
              voice_id: data.settings?.voice_id,
              voice_personality: data.settings?.voice_personality,
            });
            if (data.settings?.voice_id) {
              setSelectedVoice(data.settings.voice_id);
            }
            if (data.settings?.voice_personality) {
              setSelectedPersonality(data.settings.voice_personality);
            }
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

  // Continuous Liveness Heartbeat: ensures microphone speech recognition stays alive for entire call
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (
        isCallActiveRef.current &&
        !isSpeakingRef.current &&
        !isThinkingRef.current &&
        !isMutedRef.current
      ) {
        if (!recognitionRef.current) {
          console.log("[Voice Engine] Heartbeat watchdog: reviving speech recognition");
          startSpeechRecognitionLoop();
        }
      }
    }, 2500);
    return () => clearInterval(heartbeat);
  }, []);

  const stopAllMedia = () => {
    isCallActiveRef.current = false;
    isSpeakingRef.current = false;
    isThinkingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
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

  // Speak aloud using browser SpeechSynthesis with Voice Modulation & Turn-Taking Protection
  const speakAIspeech = (text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      if (onDone) onDone();
      return;
    }

    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);

    // Turn-taking safety: immediately stop recognition so microphone does not capture device speaker audio
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
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

    const profile =
      VOICE_PROFILES[selectedVoice] || VOICE_PROFILES["nigerian_male"];
    const utterance = new SpeechSynthesisUtterance(cleanSpoken);
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    currentUtteranceRef.current = utterance;

    // Pick best matching natural voice from browser using intelligent gender & accent resolution
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = pickBestVoice(voices, profile);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    let finishTriggered = false;
    const handleFinish = () => {
      if (finishTriggered) return;
      finishTriggered = true;
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      currentUtteranceRef.current = null;

      // 350ms buffer for room speaker echo to dissipate before reopening mic
      setTimeout(() => {
        if (
          isCallActiveRef.current &&
          !isMutedRef.current &&
          !isThinkingRef.current &&
          !isSpeakingRef.current
        ) {
          startSpeechRecognitionLoop();
        }
        if (onDone) {
          onDone();
        }
      }, 350);
    };

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setIsListening(false);
      // Keep-alive loop to prevent Android Chrome audio engine from stalling
      keepAliveIntervalRef.current = setInterval(() => {
        if (
          typeof window !== "undefined" &&
          window.speechSynthesis &&
          window.speechSynthesis.speaking
        ) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 3500);
    };

    utterance.onend = handleFinish;
    utterance.onerror = (e) => {
      console.warn("Speech synthesis notice:", e);
      handleFinish();
    };

    // Resilient Watchdog Timer: prevents Android Chrome from indefinitely freezing if onend fails to fire
    const wordCount = cleanSpoken.split(/\s+/).length;
    const maxExpectedMs = Math.max(3500, (wordCount / 2.0) * 1000 + 2500);
    watchdogTimerRef.current = setTimeout(() => {
      if (!finishTriggered && isCallActiveRef.current) {
        console.log("[Voice Engine] Watchdog timer fired: ensuring mic listening resumes");
        handleFinish();
      }
    }, maxExpectedMs);

    window.speechSynthesis.speak(utterance);
  };

  // Start speech recognition listening loop with clean turn-taking
  const startSpeechRecognitionLoop = () => {
    // Only listen when call is active, Obey is NOT speaking, NOT thinking, and caller is not muted
    if (
      !isCallActiveRef.current ||
      isSpeakingRef.current ||
      isThinkingRef.current ||
      isMutedRef.current
    ) {
      return;
    }

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
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      const recognition = new SpeechRecClass();
      recognition.continuous = !isMobile;
      recognition.interimResults = true;
      // In Web Speech API, en-US is the universal continuous model that does not disconnect or drop
      recognition.lang = "en-US";

      let accumulatedFinal = "";

      recognition.onstart = () => {
        if (!isSpeakingRef.current && !isThinkingRef.current) {
          setIsListening(true);
        }
      };

      recognition.onresult = (event: any) => {
        // Drop any results if call ended or Obey is currently speaking or thinking
        if (
          !isCallActiveRef.current ||
          isSpeakingRef.current ||
          isThinkingRef.current
        ) {
          return;
        }

        let interim = "";
        let finalStr = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalStr += " " + trans;
          } else {
            interim += trans;
          }
        }

        if (finalStr) {
          accumulatedFinal += " " + finalStr;
        }

        const candidateText = (accumulatedFinal + " " + interim).trim();

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // When user pauses speaking for 1.1 seconds, trigger Obey AI thinking
        if (candidateText.length >= 2) {
          silenceTimerRef.current = setTimeout(() => {
            if (
              isCallActiveRef.current &&
              !isSpeakingRef.current &&
              !isThinkingRef.current &&
              candidateText.trim().length >= 2
            ) {
              const statementToSend = candidateText.trim();
              accumulatedFinal = "";
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.onend = null;
                  recognitionRef.current.abort();
                } catch {}
                recognitionRef.current = null;
              }
              processUserVoiceStatement(statementToSend);
            }
          }, 1100);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("[Voice Engine] Speech recognition error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setErrorMessage("Microphone permission was denied. Please allow microphone access.");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        // Automatically restart listening if call is active and Obey is not thinking or speaking or muted
        if (
          isCallActiveRef.current &&
          !isThinkingRef.current &&
          !isMutedRef.current &&
          !isSpeakingRef.current
        ) {
          setTimeout(() => {
            if (
              isCallActiveRef.current &&
              !isThinkingRef.current &&
              !isMutedRef.current &&
              !isSpeakingRef.current
            ) {
              startSpeechRecognitionLoop();
            }
          }, 200);
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
    isThinkingRef.current = true;
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
          voice_id: selectedVoice,
          voice_personality: selectedPersonality,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "I hear you clearly! Please go ahead.";

      if (!isCallActiveRef.current) return;

      // 2. Add assistant statement to transcript
      setTranscripts((prev) => [...prev, { role: "assistant", text: reply }]);
      isThinkingRef.current = false;
      setIsThinking(false);

      // 3. Speak reply aloud (handleFinish will cleanly start recognition when finished)
      speakAIspeech(reply);
    } catch (err) {
      console.error("AI Talk error:", err);
      isThinkingRef.current = false;
      setIsThinking(false);
      const fallbackReply =
        "I got your point. Let's keep going, what else can I assist you with?";
      setTranscripts((prev) => [
        ...prev,
        { role: "assistant", text: fallbackReply },
      ]);
      speakAIspeech(fallbackReply);
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

      // 2.5 Start MediaRecorder to capture call audio recording for WhatsApp
      try {
        const mimeType =
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : typeof MediaRecorder !== "undefined" &&
              MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
            ? "audio/ogg;codecs=opus"
            : "";
        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        console.warn("MediaRecorder start notice:", recErr);
      }

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
              voice_id: selectedVoice,
              voice_personality: selectedPersonality,
            }),
          });
          const greetData = await greetRes.json();
          if (greetData.reply) {
            initialGreeting = greetData.reply;
          }
          if (greetData.voice_id) {
            setSelectedVoice(greetData.voice_id);
          }
          if (greetData.voice_personality) {
            setSelectedPersonality(greetData.voice_personality);
          }
        } catch {}
      }

      if (!initialGreeting) {
        initialGreeting = bizInfo?.name
          ? `Hello ${effectiveName || "there"}! I am Obey, the AI voice assistant for ${bizInfo.name}. How can I help you today?`
          : `Hello ${effectiveName || "Friend"}! Great to connect with you today! I am Obey, your AI companion. What is on your mind?`;
      }

      // 5. Add greeting to transcripts
      setTranscripts([{ role: "assistant", text: initialGreeting }]);

      // 6. Speak greeting aloud. Once done, turn-taking automatically opens the microphone!
      speakAIspeech(initialGreeting);
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

    let audioDataUri = "";
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        await new Promise<void>((resolve) => {
          if (!mediaRecorderRef.current) return resolve();
          mediaRecorderRef.current.onstop = () => resolve();
          mediaRecorderRef.current.stop();
        });
      } catch {}
    }

    if (recordedChunksRef.current.length > 0) {
      try {
        const audioBlob = new Blob(recordedChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || "audio/webm",
        });
        if (audioBlob.size > 500) {
          audioDataUri = await blobToBase64(audioBlob);
        }
      } catch (blobErr) {
        console.warn("Failed to convert audio blob:", blobErr);
      }
    }

    stopAllMedia();
    setCallStatus("ended");

    // Asynchronously dispatch WhatsApp summary report & Audio Voice Note
    try {
      fetch("/api/obey/calls/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEndReport: true,
          history: finalTranscripts,
          durationSeconds: finalDuration,
          audioBase64: audioDataUri,
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
    isMutedRef.current = nextMuted;

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
      if (isCallActiveRef.current && !isSpeakingRef.current && !isThinkingRef.current) {
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
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#050b14] text-zinc-950 dark:text-white flex flex-col justify-between selection:bg-emerald-500 selection:text-black transition-colors duration-200">
      {/* Top Header */}
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-zinc-300 dark:border-slate-800 bg-white/90 dark:bg-[#060d1a]/80 backdrop-blur-md sticky top-0 z-30">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-all"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back to Portfolio</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-emerald-500/50 shrink-0">
            <img src="/obey-logo.jpg" alt="Obey" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
            Obey Free Voice Engine
          </span>
          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            100% Free
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggle showLabel={false} />
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Encrypted Audio</span>
          </div>
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

          {/* Quick Voice & Personality Switcher Pill */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm mx-auto"
              title="Click to customize Obey Voice and Personality"
            >
              <span>{VOICE_PROFILES[selectedVoice]?.flag || "🇳🇬"}</span>
              <span>{VOICE_PROFILES[selectedVoice]?.name.split(" (")[0] || "Nigerian Male"}</span>
              <span className="text-zinc-600">•</span>
              <span>
                {PERSONALITY_PROFILES[selectedPersonality]?.emoji || "💼"}{" "}
                {PERSONALITY_PROFILES[selectedPersonality]?.label.split(" ")[0]}
              </span>
              <Sliders size={11} className="text-emerald-400 ml-0.5" />
            </button>
          </div>
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

              {/* Tap to Interrupt Button when Obey is Speaking */}
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.speechSynthesis.cancel();
                    } catch {}
                    isSpeakingRef.current = false;
                    setIsSpeaking(false);
                    startSpeechRecognitionLoop();
                  }}
                  className="px-4 py-2.5 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md animate-pulse cursor-pointer"
                  title="Interrupt Obey and speak now"
                >
                  <Mic size={14} />
                  <span>Tap to Speak</span>
                </button>
              )}

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

        {/* Modal for Selecting Voice and Personality */}
        {showVoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-6 text-left shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-emerald-400" />
                  <h3 className="text-sm font-black text-white">Voice & Personality Tone</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Customize how Obey speaks with you during this live voice call.
              </p>

              {/* Voice Accent & Gender */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                  Voice Accent & Gender
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(VOICE_PROFILES).map(([key, prof]) => {
                    const isSelected = selectedVoice === key;
                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedVoice(key)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-emerald-500/10 border-emerald-500 text-white"
                            : "bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{prof.flag}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{prof.name.split(" (")[0]}</p>
                            <p className="text-[10px] text-zinc-400 truncate capitalize">
                              {prof.gender} • {prof.lang}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          <button
                            type="button"
                            onClick={(e) => previewVoice(key, e)}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition flex items-center gap-1 ${
                              previewVoiceId === key
                                ? "bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse"
                                : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700"
                            }`}
                            title={previewVoiceId === key ? "Stop voice sample" : "Test voice sample"}
                          >
                            {previewVoiceId === key ? <VolumeX size={12} /> : <Volume2 size={12} />}
                            <span>{previewVoiceId === key ? "Stop" : "Test"}</span>
                          </button>
                          {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Personality Tone */}
              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                  Personality & Speaking Tone
                </label>
                <div className="space-y-1.5">
                  {Object.entries(PERSONALITY_PROFILES).map(([key, prof]) => {
                    const isSelected = selectedPersonality === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPersonality(key)}
                        className={`w-full p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-emerald-500/10 border-emerald-500 text-white"
                            : "bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base">{prof.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{prof.label}</p>
                            <p className="text-[10px] text-zinc-400">{prof.description}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={14} className="text-emerald-400 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <Check size={14} />
                  <span>Apply Voice Settings</span>
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
