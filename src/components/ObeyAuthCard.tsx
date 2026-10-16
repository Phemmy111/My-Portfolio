"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Mail,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Phone,
} from "lucide-react";

const COUNTRY_CODES = [
  { code: "234", flag: "🇳🇬", label: "NIG (+234)" },
  { code: "233", flag: "🇬🇭", label: "GHA (+233)" },
  { code: "254", flag: "🇰🇪", label: "KEN (+254)" },
  { code: "27", flag: "🇿🇦", label: "ZAF (+27)" },
  { code: "44", flag: "🇬🇧", label: "GBR (+44)" },
  { code: "1", flag: "🇺🇸", label: "USA (+1)" },
  { code: "1", flag: "🇨🇦", label: "CAN (+1)" },
  { code: "971", flag: "🇦🇪", label: "ARE (+971)" },
];

interface ObeyAuthCardProps {
  mode: "sign-in" | "sign-up";
}

export default function ObeyAuthCard({ mode }: ObeyAuthCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/control-room";

  // Form State
  const [step, setStep] = useState<"input" | "verify">("input");
  const [countryCode, setCountryCode] = useState("234");
  const [localPhone, setLocalPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // Loading & Feedback
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Full formatted phone
  const cleanLocal = localPhone.replace(/^0+/, "").replace(/\D/g, "");
  const fullPhone = cleanLocal ? `${countryCode}${cleanLocal}` : "";

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!cleanLocal || cleanLocal.length < 7) {
      setErrorMessage("Please enter a valid WhatsApp local phone number (e.g. 9074027451).");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: fullPhone,
          email: email.trim() || undefined,
          purpose: mode === "sign-up" ? "signup" : "login",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setStep("verify");
      setCountdown(45);
      setSuccessMessage(`Passcode sent! Check your WhatsApp (+${fullPhone})${email ? ` and email (${email})` : ""}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to dispatch verification code");
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!code || code.trim().length !== 6) {
      setErrorMessage("Please enter the 6-digit verification code sent to your phone/email.");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: fullPhone || email,
          code: code.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid verification code");
      }

      setSuccessMessage("✓ Verified successfully! Launching your Control Room...");
      
      // Give half a second for user to see success state, then redirect
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 600);
    } catch (err: any) {
      setErrorMessage(err.message || "Verification failed");
      setVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center">
      {/* Obey Header */}
      <Link href="/" className="flex flex-col items-center mb-6 group text-center">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-emerald-600/25 mb-3 group-hover:scale-105 transition-transform border border-emerald-500/20 bg-emerald-950/20">
          <Image
            src="/obey-logo.jpg"
            alt="Obey Logo"
            width={64}
            height={64}
            className="w-full h-full object-cover"
            priority
          />
        </div>
        <h1 className="text-2xl font-black text-zinc-950 dark:text-white tracking-tight flex items-center justify-center gap-2">
          Obey Business
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
            AI 2.0
          </span>
        </h1>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold mt-1">
          {mode === "sign-up"
            ? "Create your business account & activate 7-Day Free Trial"
            : "Sign in to your Business Control Room"}
        </p>
      </Link>

      {/* Main Authentication Card */}
      <div className="w-full bg-white dark:bg-[#0c0d0e] border border-zinc-300 dark:border-zinc-800 shadow-2xl rounded-3xl p-6 sm:p-8">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-emerald-700 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}

        {step === "input" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                <span>WhatsApp Phone Number *</span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Instant Code via WhatsApp
                </span>
              </label>

              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl px-2.5 py-3 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none shrink-0"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.label}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  required
                  placeholder="907 402 7451"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl px-4 py-3 text-sm font-mono font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Enter your WhatsApp local number without the leading zero (e.g. 9074027451).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                <span>Backup Email Address (Recommended)</span>
                <span className="text-[10px] text-zinc-400">Email Fallback</span>
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Obey will also deliver the 6-digit code to this inbox simultaneously.
              </p>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching Passcode...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Send WhatsApp & Email Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Trust badges */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-around text-[11px] text-zinc-500 font-medium">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> 100% Free & Fast
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Dual-Channel Delivery
              </span>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center space-y-1 mb-2">
              <span className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2 font-bold">
                <Phone className="w-5 h-5" />
              </span>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                Enter 6-Digit Passcode
              </h2>
              <p className="text-xs text-zinc-500">
                Delivered to <strong className="text-zinc-800 dark:text-zinc-200">+{fullPhone}</strong>
                {email && <span> & <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong></span>}
              </p>
            </div>

            <div>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center text-3xl font-mono font-black tracking-widest bg-zinc-50 dark:bg-zinc-900 border-2 border-emerald-500/50 text-zinc-950 dark:text-white rounded-2xl py-3.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
            >
              {verifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Passcode...</span>
                </>
              ) : (
                <>
                  <span>Verify & Enter Control Room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Resend & Change Number */}
            <div className="pt-2 flex items-center justify-between text-xs text-zinc-500 font-semibold">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition"
              >
                ← Change Number
              </button>

              <button
                type="button"
                disabled={countdown > 0 || sending}
                onClick={handleSendOtp}
                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition disabled:opacity-50"
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend Code"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Switch between Sign In and Sign Up */}
      <div className="mt-5 text-center text-xs text-zinc-600 dark:text-zinc-400">
        {mode === "sign-up" ? (
          <p>
            Already registered your business?{" "}
            <Link href="/sign-in" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
              Sign in with WhatsApp
            </Link>
          </p>
        ) : (
          <p>
            Don&apos;t have a business account yet?{" "}
            <Link href="/sign-up" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
              Activate 7-Day Free Trial
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
