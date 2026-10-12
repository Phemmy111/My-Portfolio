"use client";

import React, { useState } from "react";
import { Bot, X, MessageSquare, Sparkles } from "lucide-react";
import ObeyChatConsole from "./ObeyChatConsole";

interface ObeyFloatingAssistantProps {
  onTaskUpdated?: () => void;
}

export default function ObeyFloatingAssistant({ onTaskUpdated }: ObeyFloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-zinc-950 dark:bg-zinc-900 text-white border border-emerald-500/40 shadow-2xl hover:border-emerald-400 hover:scale-105 active:scale-95 transition-all"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold shadow-md shadow-emerald-500/30">
                <Bot size={18} />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
            </div>

            <div className="text-left hidden sm:block">
              <p className="text-xs font-black tracking-tight flex items-center gap-1">
                Chat with Obey <Sparkles size={11} className="text-amber-400" />
              </p>
              <p className="text-[10px] text-emerald-400 font-semibold leading-none">
                AI Personal Assistant
              </p>
            </div>
          </button>
        ) : null}
      </div>

      {/* Floating Modal Drawer */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[460px] md:w-[500px] shadow-2xl rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <ObeyChatConsole
            onTaskUpdated={onTaskUpdated}
            onClose={() => setIsOpen(false)}
            isFloating={true}
          />
        </div>
      )}
    </>
  );
}
