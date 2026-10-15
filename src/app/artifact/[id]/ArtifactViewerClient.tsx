"use client";

import React, { useState } from "react";
import { Eye, Code, Copy, Check, Download, RefreshCw } from "lucide-react";
import { Artifact } from "@/lib/artifact-engine";

interface Props {
  artifact: Artifact;
}

export default function ArtifactViewerClient({ artifact }: Props) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">(
    artifact.type === "code" || artifact.type === "markdown" ? "code" : "preview"
  );
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = artifact.type === "html" ? "html" : artifact.type === "svg" ? "svg" : artifact.type === "markdown" ? "md" : "txt";
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Storage polyfill ensuring localStorage never throws SecurityError in sandboxed iframes
  const storagePolyfill = `
<script>
(function() {
  try {
    var testKey = '__obey_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch(e) {
    console.warn('[Obey Preview] Sandbox active, polyfilling localStorage with memory storage');
    var mem = {};
    try {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: function(k) { return mem[k] !== undefined ? mem[k] : null; },
          setItem: function(k, v) { mem[k] = String(v); },
          removeItem: function(k) { delete mem[k]; },
          clear: function() { mem = {}; },
          key: function(i) { return Object.keys(mem)[i] || null; },
          get length() { return Object.keys(mem).length; }
        },
        configurable: true,
        writable: true
      });
    } catch(err) {}
  }
})();
</script>
`;

  // Prepare safe sandboxed HTML with Tailwind CSS CDN and storage polyfill preloaded
  const isCompleteDoc = artifact.content.includes("<!DOCTYPE") || artifact.content.includes("<html");
  let sandboxedHtml = "";
  if (isCompleteDoc) {
    sandboxedHtml = artifact.content.includes("<head>")
      ? artifact.content.replace("<head>", `<head>${storagePolyfill}`)
      : `${storagePolyfill}${artifact.content}`;
  } else {
    sandboxedHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  ${storagePolyfill}
  <style>
    body {
      margin: 0;
      padding: 1rem;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: transparent;
      color: #0f172a;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #f8fafc;
      }
    }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>
    `;
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Control Bar */}
      <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "preview"
                ? "bg-emerald-500 text-black shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Eye size={14} />
            <span>Live Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "code"
                ? "bg-emerald-500 text-black shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Code size={14} />
            <span>Source Code</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "preview" && (
            <button
              type="button"
              onClick={() => setKey((k) => k + 1)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs flex items-center gap-1 transition-colors"
              title="Reload preview"
            >
              <RefreshCw size={14} />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition-all"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? "Copied!" : "Copy Code"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition-all"
            title="Download file"
          >
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-[500px] flex flex-col relative bg-zinc-950">
        {activeTab === "preview" ? (
          <div className="flex-1 w-full h-full flex flex-col p-4 bg-white dark:bg-zinc-950">
            <iframe
              key={key}
              srcDoc={sandboxedHtml}
              title={artifact.title}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
              className="w-full flex-1 min-h-[550px] border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-inner"
            />
          </div>
        ) : (
          <div className="flex-1 p-5 overflow-auto font-mono text-xs text-zinc-300 leading-relaxed bg-zinc-950">
            <pre className="whitespace-pre-wrap select-all font-mono">
              <code>{artifact.content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
