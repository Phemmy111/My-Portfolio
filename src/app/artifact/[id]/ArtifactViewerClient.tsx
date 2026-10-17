"use client";

import React, { useState } from "react";
import { Eye, Code, Copy, Check, Download, RefreshCw, Workflow, ArrowRight, FileJson, Zap, Layers } from "lucide-react";
import { Artifact } from "@/lib/artifact-engine";

interface Props {
  artifact: Artifact;
}

export default function ArtifactViewerClient({ artifact }: Props) {
  const isN8n = artifact.type === "n8n_workflow" || (artifact.content.includes('"nodes"') && artifact.content.includes('"connections"'));
  const [activeTab, setActiveTab] = useState<"preview" | "code">(
    artifact.type === "code" || artifact.type === "markdown" ? "code" : "preview"
  );
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);

  let n8nData: any = null;
  if (isN8n) {
    try {
      n8nData = JSON.parse(artifact.content);
    } catch {}
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = isN8n
      ? "json"
      : artifact.type === "html"
      ? "html"
      : artifact.type === "svg"
      ? "svg"
      : artifact.type === "markdown"
      ? "md"
      : artifact.type === "document"
      ? "doc"
      : "txt";
    const mime = isN8n ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
    const blob = new Blob([artifact.content], { type: mime });
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
          isN8n && n8nData?.nodes ? (
            <div className="flex-1 w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6 text-white max-w-5xl mx-auto">
              {/* Workflow Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 space-y-4 shadow-xl text-left">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-black text-sm">
                      n8n
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white">{artifact.title}</h2>
                      <p className="text-xs text-zinc-400">
                        {artifact.description || "Production-Ready n8n AI Agent Workflow Blueprint"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <Zap size={12} />
                      <span>{n8nData.nodes.length} Nodes Connected</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copied ? "Copied!" : "Copy Raw n8n JSON"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download .json</span>
                    </button>
                  </div>
                </div>

                {/* Quick Import Instructions */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-xs text-zinc-300 space-y-1.5">
                  <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Workflow size={14} />
                    <span>How to import this workflow into your n8n canvas:</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400">
                    <li>Click <strong>Copy Raw n8n JSON</strong> above (or download the <strong>.json</strong> file).</li>
                    <li>Open your n8n workspace canvas and simply press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-white border border-zinc-700 font-mono">Ctrl + V</kbd> (or Cmd+V on Mac).</li>
                    <li>Or click the three dots (⋮) in the top-right of n8n ➔ <strong>Import from File</strong>.</li>
                    <li>Add your credentials in any highlighted nodes, test the trigger, and switch to <strong>Active</strong>!</li>
                  </ol>
                </div>
              </div>

              {/* Visual Flow Pipeline */}
              <div className="space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Layers size={14} className="text-emerald-400" />
                    <span>Visual Node Architecture ({n8nData.nodes.length} Nodes)</span>
                  </h3>
                  <span className="text-[10px] text-zinc-500">Auto-configured pipeline</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {n8nData.nodes.map((node: any, idx: number) => {
                    const isTrigger = node.type.includes("webhook") || node.type.includes("trigger") || node.type.includes("cron");
                    const isAi = node.type.includes("openAi") || node.type.includes("agent") || node.type.includes("langchain");
                    const isStorage = node.type.includes("supabase") || node.type.includes("database") || node.type.includes("sheets");

                    return (
                      <div
                        key={node.id || idx}
                        className={`p-4 rounded-xl border text-left space-y-2.5 transition-all relative ${
                          isTrigger
                            ? "bg-amber-500/5 border-amber-500/30"
                            : isAi
                            ? "bg-purple-500/5 border-purple-500/30"
                            : isStorage
                            ? "bg-blue-500/5 border-blue-500/30"
                            : "bg-zinc-900/60 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                            Step #{idx + 1}
                          </span>
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                              isTrigger
                                ? "bg-amber-500/20 text-amber-300"
                                : isAi
                                ? "bg-purple-500/20 text-purple-300"
                                : isStorage
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {isTrigger ? "Trigger" : isAi ? "AI Engine" : isStorage ? "Data Store" : "Action"}
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-black text-white truncate">{node.name}</p>
                          <p className="text-[10px] font-mono text-zinc-400 truncate">
                            {node.type.replace(/^.*[./]/, "")}
                          </p>
                        </div>

                        {node.parameters && Object.keys(node.parameters).length > 0 && (
                          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-900 text-[10px] text-zinc-400 font-mono space-y-0.5 max-h-20 overflow-hidden">
                            {Object.entries(node.parameters).slice(0, 3).map(([k, v]) => (
                              <p key={k} className="truncate">
                                <span className="text-zinc-500">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full h-full flex flex-col p-4 bg-white dark:bg-zinc-950">
              <iframe
                key={key}
                srcDoc={sandboxedHtml}
                title={artifact.title}
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
                className="w-full flex-1 min-h-[550px] border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-inner"
              />
            </div>
          )
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
