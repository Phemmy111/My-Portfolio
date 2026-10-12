"use client";

import { useState } from "react";
import { MessageCircle, GitFork, MapPin, CheckCircle2, Send, Loader2 } from "lucide-react";
import { PERSONAL } from "@/lib/data";

export default function Contact() {
  return (
    <section id="contact" className="section-pad border-t border-zinc-400/40 dark:border-zinc-800">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="mb-12 text-center">
          <span className="text-zinc-700 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">
            Get In Touch
          </span>
          <h2 className="text-4xl font-black mt-2 text-zinc-950 dark:text-white">Let&apos;s Work Together</h2>
          <p className="text-zinc-900 dark:text-zinc-300 mt-3 max-w-lg mx-auto text-base font-medium">
            Got a project, idea, or just want to say hi? I&apos;m always open to new opportunities.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          {/* Contact cards */}
          <div className="space-y-4">
            {[
              {
                icon: <MessageCircle size={20} />,
                label: "WhatsApp",
                value: PERSONAL.whatsapp,
                href: `https://wa.me/234${PERSONAL.whatsapp.replace(/^0/, "")}`,
                color: "#10b981",
                desc: "Best for quick replies",
              },
              {
                icon: <GitFork size={20} />,
                label: "GitHub",
                value: "Phemmy111",
                href: PERSONAL.github,
                color: "#94a3b8",
                desc: "See my code",
              },
              {
                icon: <MapPin size={20} />,
                label: "Location",
                value: PERSONAL.location,
                href: null,
                color: "#64748b",
                desc: "Open to remote worldwide",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-4 p-5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] hover:border-black dark:hover:border-zinc-600 transition-all duration-200 shadow-xs"
              >
                <div
                  className="p-2.5 rounded-xl shrink-0 border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-[#141414]"
                  style={{ color: item.color }}
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-400 font-bold uppercase tracking-wider">
                    {item.label}
                  </p>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-extrabold hover:underline text-black dark:text-white mt-0.5 inline-block"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="font-extrabold text-black dark:text-white mt-0.5">{item.value}</p>
                  )}
                  <p className="text-xs text-zinc-700 dark:text-zinc-400 mt-0.5 font-semibold">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive message form connected to Admin database */}
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("Web Development");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, service, message }),
      });

      if (!res.ok) {
        throw new Error("Could not send message. Please try again.");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit message");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="text-xl font-bold text-zinc-950 dark:text-white">Message Received!</h3>
        <p className="text-sm text-zinc-800 dark:text-zinc-300 font-medium">
          Thanks <span className="font-bold text-black dark:text-white">{name}</span>. Your inquiry has been sent to Femi. Expect a swift reply!
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => {
              setSubmitted(false);
              setMessage("");
            }}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-200"
          >
            Send Another Note
          </button>
          <a
            href={`https://wa.me/234${PERSONAL.whatsapp.replace(/^0/, "")}?text=Hi Femi! I just sent you a message through your website regarding ${encodeURIComponent(service)}.`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5"
          >
            <MessageCircle size={14} />
            Chat on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-950 dark:text-zinc-200 mb-1.5">
            Your Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Victoria Cole"
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-black dark:focus:border-zinc-500 transition-colors text-sm font-medium shadow-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-950 dark:text-zinc-200 mb-1.5">
            Your Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-black dark:focus:border-zinc-500 transition-colors text-sm font-medium shadow-xs"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-950 dark:text-zinc-200 mb-1.5">
          Project Focus
        </label>
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-zinc-500 transition-colors text-sm font-medium shadow-xs"
        >
          <option value="Web Development">Full-Stack Web Development (Next.js)</option>
          <option value="Automation / n8n">Automation & n8n Workflow Architecture</option>
          <option value="AI Integration">AI Agents & Intelligent Tools</option>
          <option value="Mobile App">Mobile App (Flutter)</option>
          <option value="Video / Audio">Video Editing & Music Production</option>
          <option value="General Consultation">General Strategy & Consultation</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-950 dark:text-zinc-200 mb-1.5">
          Project Brief / Message *
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          placeholder="Describe what you want to build or automate..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#080808] text-black dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-black dark:focus:border-zinc-500 transition-colors text-sm resize-none font-medium shadow-xs"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending Message...
          </>
        ) : (
          <>
            <Send size={16} />
            Send Inquiry to Femi
          </>
        )}
      </button>

      <p className="text-[11px] text-center text-zinc-700 dark:text-zinc-400 font-semibold">
        Saves directly to Femi&apos;s desk with priority response within 24 hours.
      </p>
    </form>
  );
}
