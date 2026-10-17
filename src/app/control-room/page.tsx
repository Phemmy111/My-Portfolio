"use client";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import {
  Building2,
  Users,
  PhoneCall,
  Code2,
  Zap,
  Settings,
  Plus,
  Search,
  ExternalLink,
  Copy,
  Check,
  Download,
  Trash2,
  Play,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Phone,
  Bot,
  Filter,
  CheckCircle2,
  Save,
  HelpCircle,
  Send,
  LogOut,
  Radio,
  Clock,
  Image as ImageIcon,
  UploadCloud,
  Video,
  X,
  Scissors,
  Smartphone,
  QrCode,
  Eye,
  ChevronDown,
  Layers,
  CreditCard,
  BookOpen,
  Menu,
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

interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string | null;
  plan?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
  whatsapp_instance_name?: string | null;
  whatsapp_status?: string | null;
}

interface WorkspaceSettings {
  workspace_id: string;
  business_bio?: string | null;
  catalog_summary?: string | null;
  voice_greeting?: string | null;
  whatsapp_welcome?: string | null;
  fallback_action?: string | null;
  voice_id?: string | null;
  voice_personality?: string | null;
}

interface WorkspaceRule {
  id: string;
  workspace_id: string;
  trigger_type: string;
  trigger_keywords: string[];
  response_text: string;
  action: string;
  is_active: boolean;
  priority: number;
}

interface WorkspaceLead {
  id: string;
  workspace_id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  source: string;
  status: string;
  intent_summary?: string | null;
  last_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface WorkspaceCallLog {
  id: string;
  workspace_id: string;
  caller_phone?: string | null;
  caller_name?: string | null;
  duration_seconds: number;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  created_at?: string;
}

function ControlRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSlug = searchParams.get("biz") || "";

  // Data states
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWs, setCurrentWs] = useState<Workspace | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [rules, setRules] = useState<WorkspaceRule[]>([]);
  const [leads, setLeads] = useState<WorkspaceLead[]>([]);
  const [callLogs, setCallLogs] = useState<WorkspaceCallLog[]>([]);

  // WhatsApp connection states
  const [waState, setWaState] = useState<string>("disconnected");
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState<boolean>(false);
  const [waConnectedNumber, setWaConnectedNumber] = useState<string>("");
  const [waProfileName, setWaProfileName] = useState<string>("");

  // WhatsApp Plan B (Pairing Code) states
  const [waConnectMethod, setWaConnectMethod] = useState<"code" | "qr">("code");
  const [waPhoneNumber, setWaPhoneNumber] = useState<string>("");
  const [waPairingLoading, setWaPairingLoading] = useState<boolean>(false);
  const [waPairingError, setWaPairingError] = useState<string>("");
  const [waCopiedCode, setWaCopiedCode] = useState<boolean>(false);

  // UI states
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "whatsapp" | "status" | "brain" | "rules" | "leads" | "hotline"
  >("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navFilter, setNavFilter] = useState("");

  // Status Automator states
  const [statuses, setStatuses] = useState<any[]>([]);
  const [statusContent, setStatusContent] = useState("");
  const [statusMediaUrl, setStatusMediaUrl] = useState("");
  const [statusMediaType, setStatusMediaType] = useState<"image" | "video">("image");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaFileName, setMediaFileName] = useState("");
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video Trimmer states (Max 1:30s WhatsApp Standard)
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(90);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const initialLoadedRef = useRef(false);

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Draggable WhatsApp Timeline Trimmer states
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<"left" | "right" | "window" | null>(null);
  const dragStartRef = useRef<{ clientX: number; start: number; end: number; duration: number }>({
    clientX: 0,
    start: 0,
    end: 0,
    duration: 0,
  });

  const handleTimelinePointerDown = (type: "left" | "right" | "window", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActiveDrag(type);
    dragStartRef.current = {
      clientX: e.clientX,
      start: trimStart,
      end: trimEnd,
      duration: videoDuration || 90,
    };
  };

  const handleTimelinePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !timelineTrackRef.current) return;
    const trackRect = timelineTrackRef.current.getBoundingClientRect();
    if (!trackRect.width) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dt = (dx / trackRect.width) * dragStartRef.current.duration;
    const maxClip = 90;

    if (activeDrag === "window") {
      const clipLen = dragStartRef.current.end - dragStartRef.current.start;
      let newStart = dragStartRef.current.start + dt;
      newStart = Math.max(0, Math.min(dragStartRef.current.duration - clipLen, newStart));
      const newEnd = newStart + clipLen;
      setTrimStart(Math.round(newStart));
      setTrimEnd(Math.round(newEnd));
      if (videoPlayerRef.current) videoPlayerRef.current.currentTime = newStart;
    } else if (activeDrag === "left") {
      let newStart = dragStartRef.current.start + dt;
      newStart = Math.max(0, Math.min(trimEnd - 1, newStart));
      if (trimEnd - newStart > maxClip) {
        newStart = trimEnd - maxClip;
      }
      setTrimStart(Math.round(newStart));
      if (videoPlayerRef.current) videoPlayerRef.current.currentTime = newStart;
    } else if (activeDrag === "right") {
      let newEnd = dragStartRef.current.end + dt;
      newEnd = Math.max(trimStart + 1, Math.min(dragStartRef.current.duration, newEnd));
      if (newEnd - trimStart > maxClip) {
        newEnd = trimStart + maxClip;
      }
      setTrimEnd(Math.round(newEnd));
      if (videoPlayerRef.current) videoPlayerRef.current.currentTime = newEnd;
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setActiveDrag(null);
    }
  };

  const [postingStatus, setPostingStatus] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState("");
  const [statusErrorMsg, setStatusErrorMsg] = useState("");
  const [generatingStatus, setGeneratingStatus] = useState(false);
  const [aiVariations, setAiVariations] = useState<{ type: string; content: string }[]>([]);
  const [autoStatusEnabled, setAutoStatusEnabled] = useState(false);
  const [autoStatusInterval, setAutoStatusInterval] = useState("daily_morning");
  const [savingStatusSchedule, setSavingStatusSchedule] = useState(false);
  const [autoViewStatus, setAutoViewStatus] = useState(true);
  const [autoCommentStatus, setAutoCommentStatus] = useState(false);
  const [commentTone, setCommentTone] = useState("friendly");
  const [commentRateLimit, setCommentRateLimit] = useState("unlimited");

  const { isLoaded: clerkLoaded, isSignedIn, user } = useUser();

  // Modal states
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [modalCountryCode, setModalCountryCode] = useState("234");
  const [modalLocalPhone, setModalLocalPhone] = useState("");
  const [newWsForm, setNewWsForm] = useState({
    name: "",
    slug: "",
    owner_name: "",
    owner_email: "",
    plan: "trial",
  });
  const [createWsLoading, setCreateWsLoading] = useState(false);
  const [createWsError, setCreateWsError] = useState("");

  const handleAddBusinessClick = () => {
    const isEnterprise =
      currentWs?.plan === "enterprise" || currentWs?.plan === "lifetime";
    if (!isEnterprise) {
      alert(
        "🔒 Multi-Business Management is an exclusive feature of the Enterprise / Founder Plan.\n\nPlease upgrade to the Enterprise Plan to add and manage a second business."
      );
      return;
    }

    if (workspaces.length >= 2) {
      alert(
        "⚠️ You have reached the maximum limit of 2 business workspaces included in your Enterprise / Founder Plan."
      );
      return;
    }

    setShowNewWsModal(true);
  };

  useEffect(() => {
    if (user) {
      setNewWsForm((prev) => ({
        ...prev,
        owner_name: prev.owner_name || user.fullName || user.firstName || "",
        owner_email: prev.owner_email || user.primaryEmailAddress?.emailAddress || "",
      }));
      if (user.primaryPhoneNumber?.phoneNumber) {
        setModalLocalPhone(user.primaryPhoneNumber.phoneNumber.replace(/[^0-9]/g, "").slice(-10));
      }
    }
  }, [user]);

  // Rule Form state
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleKeywords, setNewRuleKeywords] = useState("");
  const [newRuleResponse, setNewRuleResponse] = useState("");
  const [newRuleAction, setNewRuleAction] = useState("reply_only");
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  // Rule Simulator state
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState<string | null>(null);

  // Leads Filter
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");

  // Broadcast state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTemplate, setBroadcastTemplate] = useState(
    "Hello {name}! We have an exclusive update from {business}. Would you like to check out our latest offers?"
  );
  const [broadcastFilter, setBroadcastFilter] = useState("all");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    dispatchedCount: number;
    totalTargets: number;
  } | null>(null);

  // Billing state
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Session user state (for OTP auth)
  const [sessionUser, setSessionUser] = useState<{
    phone?: string;
    email?: string;
    workspaceSlug?: string;
    ownerName?: string;
    plan?: string;
  } | null>(null);

  // Load auth session & workspaces immediately on mount
  useEffect(() => {
    fetchSessionUser();
    fetchWorkspaces();
  }, [paramSlug, user?.id]);

  async function fetchSessionUser() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.authenticated && data.user) {
        setSessionUser(data.user);
      }
    } catch {}
  }

  async function fetchWorkspaces() {
    setLoading(true);
    try {
      let loadedCurrent: Workspace | null = null;
      if (paramSlug) {
        const slugRes = await fetch(`/api/obey/workspaces?slug=${encodeURIComponent(paramSlug)}`);
        const slugData = await slugRes.json();
        if (slugData.workspace) {
          loadedCurrent = slugData.workspace;
          setCurrentWs(slugData.workspace);
          loadWorkspaceDetails(slugData.workspace.slug);
        }
      }

      const res = await fetch("/api/obey/workspaces");
      const data = await res.json();
      if (data.workspaces && data.workspaces.length > 0) {
        let wsList: Workspace[] = [...data.workspaces];
        if (loadedCurrent && !wsList.some((w) => w.id === loadedCurrent!.id)) {
          wsList.unshift(loadedCurrent);
        }
        setWorkspaces(wsList);
        if (!paramSlug) {
          const selected = wsList[0];
          setCurrentWs(selected);
          loadWorkspaceDetails(selected.slug);
        }
      } else if (loadedCurrent) {
        setWorkspaces([loadedCurrent]);
      } else if (!paramSlug) {
        setWorkspaces([]);
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
      setLoading(false);
    }
  }

  async function loadWorkspaceDetails(slug: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/obey/workspaces/${slug}`);
      const data = await res.json();
      if (data.workspace) {
        setCurrentWs(data.workspace);
        try {
          localStorage.setItem("obey_current_workspace", data.workspace.slug);
        } catch {}
        setSettings(data.settings);
        setRules(data.rules || []);
        setLeads(data.leads || []);
        setCallLogs(data.callLogs || []);
        setStatuses(data.statuses || []);
        setAutoStatusEnabled(data.workspace.auto_status_enabled || false);
        const isEngagementActive = Boolean(data.workspace.auto_comment_status && data.workspace.auto_view_status !== false);
        setAutoViewStatus(isEngagementActive);
        setAutoCommentStatus(isEngagementActive);
        setCommentTone(data.workspace.comment_tone || "friendly");
        setCommentRateLimit(data.workspace.comment_rate_limit || (data.workspace.slug === "femi" ? "unlimited" : "plan_based"));
        if (data.workspace.whatsapp_status) {
          setWaState(data.workspace.whatsapp_status);
        }
      }
    } catch (err) {
      console.error("Failed to load workspace details:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectMediaFile = (file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setStatusErrorMsg("Unsupported format. Please select an image (JPG, PNG, WEBP) or video (MP4, MOV, WEBM).");
      return;
    }

    if (isVideo) {
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
      setPendingVideoFile(file);

      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        const dur = Math.round(tempVideo.duration) || 0;
        setVideoDuration(dur);
        setTrimStart(0);
        setTrimEnd(Math.min(dur, 90)); // Enforce default max 1:30s (90 seconds)
        setShowVideoTrimmer(true);
      };
      return;
    }

    uploadMediaAsset(file);
  };

  const uploadMediaAsset = async (file: File, startOffset: number = 0, endOffset?: number) => {
    if (!file) return;

    setUploadingMedia(true);
    setUploadProgress(0);
    setStatusErrorMsg("");

    const isVideo = file.type.startsWith("video/");
    const safeClipDuration =
      typeof endOffset === "number" && endOffset > startOffset
        ? Math.min(endOffset - startOffset, 90)
        : 90;

    try {
      // 1. Get signed credentials from our server for direct client-to-Cloudinary upload
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: "obey-status-media",
          resourceType: isVideo ? "video" : "image",
        }),
      });

      const signData = await signRes.json();
      if (!signRes.ok || !signData.signature) {
        throw new Error(signData.error || "Failed to generate upload signature");
      }

      // 2. Direct browser upload to Cloudinary (bypasses Vercel 4.5MB payload limit completely!)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signData.apiKey);
      formData.append("timestamp", String(signData.timestamp));
      formData.append("signature", signData.signature);
      formData.append("folder", signData.folder);

      const endpoint = `https://api.cloudinary.com/v1_1/${signData.cloudName}/${isVideo ? "video" : "image"}/upload`;

      const uploadResult: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response from media server"));
            }
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData?.error?.message || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network connection error during media upload"));
        xhr.send(formData);
      });

      let finalUrl = uploadResult.secure_url;

      // 3. If video: Apply the user's custom chosen 1:30s trim and WhatsApp compression
      if (isVideo) {
        const publicId = uploadResult.public_id;
        finalUrl = `https://res.cloudinary.com/${signData.cloudName}/video/upload/du_${Math.round(safeClipDuration)},q_auto,so_${Math.round(startOffset)},vc_auto/${publicId}.mp4`;
        // Pre-warm the transformed Cloudinary video cache in background so it's ready instantly
        fetch(finalUrl, { method: "HEAD" }).catch(() => {});
      }

      setStatusMediaUrl(finalUrl);
      setStatusMediaType(isVideo ? "video" : "image");
      setMediaFileName(file.name);
      setShowVideoTrimmer(false);
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl("");
      }
      setPendingVideoFile(null);

      setStatusSuccessMsg(
        isVideo
          ? `🎬 Video trimmed to ${formatSeconds(safeClipDuration)} and compressed for WhatsApp! Ready to post.`
          : `📸 Photo uploaded successfully! Ready to post.`
      );
      setTimeout(() => setStatusSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Direct upload error:", err);
      setStatusErrorMsg(err.message || "Failed to upload media file");
    } finally {
      setUploadingMedia(false);
      setUploadProgress(null);
    }
  };

  const handlePostStatus = async (customContent?: string, customMedia?: string, customType?: "image" | "video") => {
    if (!currentWs) return;
    const textToPost = customContent !== undefined ? customContent : statusContent;
    const mediaToPost = customMedia !== undefined ? customMedia : statusMediaUrl;
    const typeToPost = customType !== undefined ? customType : statusMediaType;

    if (!textToPost.trim() && !mediaToPost.trim()) {
      setStatusErrorMsg("Please write some text or upload an image/video for your WhatsApp status story.");
      return;
    }

    setPostingStatus(true);
    setStatusErrorMsg("");
    setStatusSuccessMsg("");

    try {
      const res = await fetch("/api/obey/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          content: textToPost.trim(),
          media_url: mediaToPost.trim() || undefined,
          media_type: mediaToPost.trim() ? typeToPost : "text",
          auto_post_now: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to post status to WhatsApp");
      }

      setStatusSuccessMsg("🚀 Boom! Your status was published directly to your WhatsApp Status Broadcast!");
      setStatusContent("");
      setStatusMediaUrl("");
      setMediaFileName("");
      const refRes = await fetch(`/api/obey/status?workspace_id=${currentWs.id}`);
      const refData = await refRes.json();
      if (refData.statuses) setStatuses(refData.statuses);
    } catch (err: any) {
      setStatusErrorMsg(err.message || "Failed to post status to WhatsApp");
    } finally {
      setPostingStatus(false);
    }
  };

  const handleGenerateAiStatus = async (topic?: string) => {
    if (!currentWs) return;
    setGeneratingStatus(true);
    setStatusErrorMsg("");
    try {
      const res = await fetch("/api/obey/status/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          topic,
        }),
      });
      const data = await res.json();
      if (data.variations) {
        setAiVariations(data.variations);
      }
    } catch (err: any) {
      console.warn("AI Status Gen error:", err);
    } finally {
      setGeneratingStatus(false);
    }
  };

  const handleSaveStatusSchedule = async () => {
    if (!currentWs) return;
    setSavingStatusSchedule(true);
    try {
      const res = await fetch("/api/obey/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          auto_status_enabled: autoStatusEnabled,
          auto_status_interval: autoStatusInterval,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusSuccessMsg("✅ WhatsApp Status schedule preferences saved successfully!");
        setTimeout(() => setStatusSuccessMsg(""), 4000);
      }
    } catch (err) {
      console.error("Save schedule error:", err);
    } finally {
      setSavingStatusSchedule(false);
    }
  };

  const handleToggleStatusEngagement = async () => {
    if (!currentWs) return;
    const isCurrentlyActive = Boolean(autoCommentStatus && autoViewStatus);
    const nextVal = !isCurrentlyActive;
    setAutoViewStatus(nextVal);
    setAutoCommentStatus(nextVal);
    try {
      await fetch("/api/obey/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          auto_view_status: nextVal,
          auto_comment_status: nextVal,
        }),
      });
      setStatusSuccessMsg(
        nextVal
          ? "👁️💬 Status Viewing & AI Commenting enabled! Obey will view and engage with contacts' stories."
          : "Status Viewing & AI Commenting disabled."
      );
      setTimeout(() => setStatusSuccessMsg(""), 3500);
    } catch (e) {
      console.warn("Toggle status engagement error:", e);
    }
  };

  const handleSetCommentTone = async (newTone: string) => {
    if (!currentWs) return;
    setCommentTone(newTone);
    try {
      await fetch("/api/obey/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          comment_tone: newTone,
        }),
      });
      setStatusSuccessMsg(`Tone updated to: ${newTone}`);
      setTimeout(() => setStatusSuccessMsg(""), 3000);
    } catch (e) {
      console.warn("Update comment tone error:", e);
    }
  };

  const handleSetCommentRateLimit = async (newLimit: string) => {
    if (!currentWs) return;
    setCommentRateLimit(newLimit);
    try {
      await fetch("/api/obey/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWs.id,
          slug: currentWs.slug,
          comment_rate_limit: newLimit,
        }),
      });
      setStatusSuccessMsg(
        newLimit === "unlimited"
          ? "🚀 Rate Limit: Unlimited! Obey will comment on all contact status stories."
          : `⏱️ Rate Limit set to: ${newLimit} cooldown per contact.`
      );
      setTimeout(() => setStatusSuccessMsg(""), 3500);
    } catch (e) {
      console.warn("Update comment rate limit error:", e);
    }
  };

  const checkWhatsAppStatus = async () => {
    if (!currentWs) return;
    try {
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}/whatsapp`);
      const data = await res.json();
      if (data.status) {
        setWaState(data.status);
        if (data.qrcode) setWaQrCode(data.qrcode);
        if (data.pairingCode) setWaPairingCode(data.pairingCode);
        if (data.connectedNumber) setWaConnectedNumber(data.connectedNumber);
        if (data.profileName) setWaProfileName(data.profileName);
      }
    } catch (e) {
      console.warn("WhatsApp status check error:", e);
    }
  };

  useEffect(() => {
    if (currentWs?.owner_phone && !waPhoneNumber) {
      setWaPhoneNumber(currentWs.owner_phone);
    }
  }, [currentWs?.owner_phone, waPhoneNumber]);

  const handleGeneratePairingCode = async (phoneToUse?: string) => {
    if (!currentWs) return;
    const targetPhone = (phoneToUse || waPhoneNumber || currentWs.owner_phone || "").replace(/\D/g, "");
    if (!targetPhone || targetPhone.length < 9) {
      setWaPairingError("Please enter a valid WhatsApp phone number with country code (e.g. 2348120934828).");
      return;
    }

    setWaPairingLoading(true);
    setWaPairingError("");
    try {
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pairing_code",
          phoneNumber: targetPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate 8-digit pairing code");
      }
      if (data.pairingCode) {
        setWaPairingCode(data.pairingCode);
        setWaState("connecting");
      } else {
        throw new Error("No pairing code returned. Please try again in a moment.");
      }
    } catch (err: any) {
      setWaPairingError(err.message || "Failed to generate 8-digit pairing code.");
    } finally {
      setWaPairingLoading(false);
    }
  };

  const handleCopyPairingCode = () => {
    if (!waPairingCode) return;
    const cleanCode = waPairingCode.replace(/[^a-zA-Z0-9]/g, "");
    navigator.clipboard.writeText(cleanCode);
    setWaCopiedCode(true);
    setTimeout(() => setWaCopiedCode(false), 2500);
  };

  const handleInitWhatsApp = async () => {
    if (!currentWs) return;
    setWaLoading(true);
    try {
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "qr" }),
      });
      const data = await res.json();
      if (data.qrcode) setWaQrCode(data.qrcode);
      if (data.pairingCode) setWaPairingCode(data.pairingCode);
      setWaState("connecting");
    } catch (e) {
      console.error("Init WhatsApp error:", e);
    } finally {
      setWaLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async (thenMode: "code" | "qr" = "code") => {
    if (!currentWs) return;
    if (!confirm("Are you sure you want to disconnect this WhatsApp number? You can reconnect anytime.")) return;
    setWaLoading(true);
    try {
      await fetch(`/api/obey/workspaces/${currentWs.slug}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      setWaState("disconnected");
      setWaQrCode(null);
      setWaPairingCode(null);
      setWaConnectedNumber("");
      setWaProfileName("");
      setWaConnectMethod(thenMode);
      if (thenMode === "code") {
        setWaPhoneNumber(currentWs.owner_phone || "");
      } else {
        handleInitWhatsApp();
      }
    } catch (e) {
      console.error("Disconnect WhatsApp error:", e);
    } finally {
      setWaLoading(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (activeTab === "whatsapp" && currentWs) {
      checkWhatsAppStatus();
      if (waState !== "connected") {
        interval = setInterval(() => {
          checkWhatsAppStatus();
        }, 5000);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, currentWs?.slug, waState]);

  const handleSelectWorkspace = (slug: string) => {
    router.replace(`/control-room?biz=${slug}`);
    loadWorkspaceDetails(slug);
  };

  const handleSaveSettings = async () => {
    if (!currentWs || !settings) return;
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleInsertBioTemplate = (templateType: string) => {
    if (!settings) return;
    let bio = "";
    if (templateType === "services") {
      bio = `${currentWs?.name || "Our business"} is a premier provider of professional services, specialized consulting, and dedicated client solutions. Operating Monday to Saturday from 8:00 AM to 6:00 PM. Our mission is to deliver fast, reliable, high-impact results tailored to each client's unique needs.`;
    } else if (templateType === "retail") {
      bio = `${currentWs?.name || "Our company"} is a trusted commercial brand offering authentic products with express delivery nationwide. We pride ourselves on transparent pricing, top quality, and 24/7 dedicated customer service.`;
    } else if (templateType === "training") {
      bio = `${currentWs?.name || "Our academy"} empowers individuals and professionals with industry-leading training, hands-on mentorship, practical workshops, and high-income skill development.`;
    }
    setSettings({ ...settings, business_bio: bio });
    setStatusSuccessMsg("✨ Bio template applied! Review and click Save Brain Settings.");
    setTimeout(() => setStatusSuccessMsg(""), 3500);
  };

  const handleAppendCatalog = (snippet: string) => {
    if (!settings) return;
    const current = (settings.catalog_summary || "").trim();
    const updated = current ? `${current}\n${snippet}` : snippet;
    setSettings({ ...settings, catalog_summary: updated });
    setStatusSuccessMsg("➕ Format snippet added! Edit prices and click Save Brain Settings.");
    setTimeout(() => setStatusSuccessMsg(""), 3500);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateWsLoading(true);
    setCreateWsError("");
    try {
      const cleanPhone = modalLocalPhone.replace(/^0+/, "").replace(/[^0-9]/g, "");
      if (!cleanPhone || cleanPhone.length < 7) {
        throw new Error("Please enter a valid WhatsApp local phone number (e.g. 9074027451)");
      }
      const fullPhone = `${modalCountryCode}${cleanPhone}`;

      const res = await fetch("/api/obey/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newWsForm,
          owner_phone: fullPhone,
          owner_clerk_id: user?.id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create business workspace");
      }
      setShowNewWsModal(false);
      setNewWsForm({
        name: "",
        slug: "",
        owner_name: user?.fullName || user?.firstName || "",
        owner_email: user?.primaryEmailAddress?.emailAddress || "",
        plan: "trial",
      });
      setModalLocalPhone("");
      await fetchWorkspaces();
      if (data.workspace) {
        handleSelectWorkspace(data.workspace.slug);
      }
    } catch (err: any) {
      setCreateWsError(err.message || "Failed to create workspace");
    } finally {
      setCreateWsLoading(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWs) return;
    setRuleSubmitting(true);
    try {
      const keywords = newRuleKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_keywords: keywords,
          response_text: newRuleResponse,
          action: newRuleAction,
        }),
      });
      const data = await res.json();
      if (data.success && data.rule) {
        setRules((prev) => [data.rule, ...prev]);
        setShowNewRuleModal(false);
        setNewRuleKeywords("");
        setNewRuleResponse("");
      }
    } catch (err) {
      console.error("Failed to add rule:", err);
    } finally {
      setRuleSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!currentWs) return;
    if (!confirm("Are you sure you want to delete this auto-reply rule?")) return;
    try {
      const res = await fetch(
        `/api/obey/workspaces/${currentWs.slug}/rules?ruleId=${ruleId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWs) return;
    setBroadcastLoading(true);
    setBroadcastResult(null);
    try {
      const res = await fetch(`/api/obey/workspaces/${currentWs.slug}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: broadcastTemplate,
          statusFilter: broadcastFilter,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastResult({
          dispatchedCount: data.dispatchedCount,
          totalTargets: data.totalTargets,
        });
      } else {
        alert(data.error || "Failed to dispatch broadcast");
      }
    } catch (err: any) {
      alert("Broadcast error: " + err.message);
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleCheckoutPlan = async (plan: string) => {
    if (!currentWs) return;
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/obey/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: currentWs.slug,
          plan,
        }),
      });
      const data = await res.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert(data.error || "Could not start Paystack checkout");
      }
    } catch (err: any) {
      alert("Checkout error: " + err.message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const runTestSimulation = () => {
    if (!testInput.trim()) {
      setTestOutput(null);
      return;
    }
    const cleanTest = testInput.toLowerCase();
    for (const rule of rules) {
      const matched = rule.trigger_keywords.some((kw) =>
        cleanTest.includes(kw.toLowerCase())
      );
      if (matched) {
        setTestOutput(
          `🎯 MATCHED RULE: [${rule.trigger_keywords.join(", ")}]\nAction: ${
            rule.action
          }\n\n🤖 OBEY INSTANT REPLY:\n${rule.response_text}`
        );
        return;
      }
    }
    setTestOutput(
      `⚡ NO KEYWORD MATCH — Obey will autonomously consult your Business Bio & Catalog to craft an intelligent custom answer!`
    );
  };

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        (lead.name && lead.name.toLowerCase().includes(leadSearch.toLowerCase())) ||
        lead.phone.includes(leadSearch) ||
        (lead.intent_summary &&
          lead.intent_summary.toLowerCase().includes(leadSearch.toLowerCase()));

      const matchesStatus =
        leadStatusFilter === "all" || lead.status === leadStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [leads, leadSearch, leadStatusFilter]);

  const hotlineUrl = currentWs
    ? typeof window !== "undefined"
      ? `${window.location.origin}/call?biz=${currentWs.slug}`
      : `https://femiadelekeportfolio.vercel.app/call?biz=${currentWs.slug}`
    : "";

  const copyHotlineLink = () => {
    if (!hotlineUrl) return;
    navigator.clipboard.writeText(hotlineUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const { signOut } = useClerk();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      if (signOut) {
        await signOut();
      }
    } catch {}
    router.push("/sign-in");
  };

  const navTabs = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    {
      id: "whatsapp",
      label: "WhatsApp Connect",
      icon: MessageSquare,
      badge: waState === "connected" ? "Live" : "Scan QR",
      badgeColor: waState === "connected" ? "text-emerald-400 bg-emerald-950/80 border-emerald-800/60" : "text-amber-300 bg-amber-950/60 border-amber-800/50",
    },
    {
      id: "status",
      label: "Status Automator",
      icon: Radio,
      badge: autoCommentStatus ? "Auto" : undefined,
      badgeColor: "text-emerald-400 bg-emerald-950/80 border-emerald-800/60",
    },
    { id: "brain", label: "AI Brain & Settings", icon: Sparkles, highlight: true },
    { id: "rules", label: "Keyword Triggers", icon: Zap, badge: rules.length },
    { id: "leads", label: "Leads CRM", icon: Users, badge: leads.length },
    { id: "hotline", label: "Voice Hotline & Embed", icon: PhoneCall },
  ];

  const filteredNavTabs = navTabs.filter((t) =>
    t.label.toLowerCase().includes(navFilter.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-[#050b14] text-slate-100 flex flex-col md:flex-row selection:bg-emerald-500/20 selection:text-white pb-20 md:pb-0">
      {/* 1. Desktop Left Sidebar (Vercel Rail Style) */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 border-r border-slate-800/80 bg-[#060d1a] h-screen sticky top-0 overflow-y-auto justify-between p-4 z-30">
        <div className="space-y-4">
          {/* Top Brand Logo & Room Tag */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-500/30 bg-slate-900 shadow-sm shrink-0">
                <Image src="/obey-logo.jpg" alt="Obey Logo" width={32} height={32} className="w-full h-full object-cover" priority />
              </div>
              <div>
                <span className="font-black text-sm text-white tracking-tight block">Obey Business</span>
                <span className="text-[10px] text-slate-400 font-medium">Control Room</span>
              </div>
            </Link>
            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Live
            </span>
          </div>

          {/* Vercel-style Workspace Switcher Card */}
          {currentWs && (
            <div className="bg-[#0b1424] border border-slate-800/90 rounded-xl p-2.5 space-y-2 shadow-sm">
              <div className="relative">
                <select
                  value={currentWs?.slug || ""}
                  onChange={(e) => handleSelectWorkspace(e.target.value)}
                  className="w-full bg-slate-900/90 text-white font-bold text-xs rounded-lg pl-2.5 pr-8 py-2 focus:outline-none cursor-pointer appearance-none border border-slate-800 hover:border-slate-700 transition"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.slug} className="bg-slate-950 text-slate-200">
                      {w.slug === "femi-adeleke" ? "⭐ Main Obey" : `${w.name} (${w.plan || "Starter"})`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
                <span className="truncate max-w-[120px]">+{currentWs.owner_phone}</span>
                <span className="capitalize px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 text-[10px]">
                  {currentWs.plan || "Starter"}
                </span>
              </div>

              <button
                onClick={handleAddBusinessClick}
                className="w-full py-1.5 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Business</span>
              </button>
            </div>
          )}

          {/* Search / Filter Navigation Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Find page or setting..."
              className="w-full bg-[#0b1424] text-xs text-slate-200 placeholder-slate-500 pl-8 pr-3 py-1.5 rounded-lg border border-slate-800/80 focus:outline-none focus:border-emerald-500/50 transition"
            />
          </div>

          {/* Navigation Items (Vertical Rail) */}
          <nav className="space-y-1">
            {filteredNavTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all font-medium cursor-pointer ${
                    isActive
                      ? "bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-slate-950" : tab.highlight ? "text-amber-400" : "text-slate-400"}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border ${
                        isActive
                          ? "bg-slate-950/20 text-slate-950 border-slate-950/30 font-bold"
                          : tab.badgeColor || "bg-slate-800 text-slate-400 border-slate-700/60"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          {hotlineUrl && (
            <Link
              href={hotlineUrl}
              target="_blank"
              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                <span>Test Voice Hotline</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>
          )}

          <div className="flex items-center justify-between pt-1">
            <UserButton />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Mobile Sticky Header + Slide-Out Drawer */}
      <div className="md:hidden sticky top-0 z-40 bg-[#060d1a]/95 backdrop-blur-md border-b border-slate-800/80 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg bg-slate-900 text-slate-300 hover:text-white border border-slate-800 cursor-pointer"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Image src="/obey-logo.jpg" alt="Logo" width={24} height={24} className="rounded-md shrink-0" />
            <span className="font-bold text-xs text-white truncate max-w-[130px]">{currentWs?.name || "Obey Business"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <button
            onClick={handleAddBusinessClick}
            className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px] cursor-pointer"
          >
            + Add
          </button>
          <UserButton />
        </div>
      </div>

      {/* Mobile Slide-over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#060d1a] border-r border-slate-800 h-full p-4 flex flex-col justify-between z-10 overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Image src="/obey-logo.jpg" alt="Logo" width={28} height={28} className="rounded-md" />
                  <span className="font-black text-sm text-white">Obey Business</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Workspace Switcher in Drawer */}
              {currentWs && (
                <div className="bg-[#0b1424] border border-slate-800 rounded-xl p-2.5 space-y-2">
                  <select
                    value={currentWs?.slug || ""}
                    onChange={(e) => {
                      handleSelectWorkspace(e.target.value);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-slate-900 text-white font-bold text-xs rounded-lg pl-2 pr-7 py-2 border border-slate-800"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.slug} className="bg-slate-950 text-slate-200">
                        {w.slug === "femi-adeleke" ? "⭐ Main Obey" : `${w.name} (${w.plan || "Starter"})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Navigation Links in Drawer */}
              <nav className="space-y-1">
                {navTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                        isActive
                          ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                          : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </div>
                      {tab.badge !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 border border-slate-700">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                onClick={handleLogout}
                className="w-full py-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-bold border border-rose-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen overflow-x-hidden">
        {/* Desktop Top Sub-header Bar (Breadcrumbs + Actions) */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-[#060d1a]/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Obey Business</span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-bold">{currentWs?.name || "Workspace"}</span>
            <span className="text-slate-600">/</span>
            <span className="text-emerald-400 font-bold capitalize">{activeTab}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyHotlineLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-medium border border-slate-800 transition cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedLink ? "Copied!" : "Hotline Link"}</span>
            </button>
            {currentWs?.owner_phone && (
              <a
                href={`https://wa.me/${currentWs.owner_phone}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Test WhatsApp</span>
              </a>
            )}
          </div>
        </div>

        {/* Workspace Brand Ribbon Card */}
        <main className="p-3 sm:p-6 md:p-8 space-y-6 max-w-7xl">
          {currentWs && (
            <div className="bg-[#0b1424] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{currentWs.name}</span>
                    {currentWs.slug === "femi-adeleke" && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                        ⭐ Main Obey
                      </span>
                    )}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 capitalize">
                    {currentWs.plan || "Starter"} Plan
                  </span>
                  {currentWs.subscription_status === "trial" ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>
                        Trial ({currentWs.trial_ends_at ? `${Math.max(0, Math.ceil((new Date(currentWs.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d left` : "Active"})
                      </span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Owner: <strong className="text-slate-200">{currentWs.owner_name}</strong></span>
                  <span>Hotline: <strong className="text-slate-200 font-mono">+{currentWs.owner_phone}</strong></span>
                  <span>Slug: <code className="text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-mono text-[11px]">{currentWs.slug}</code></span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0">
                <button
                  onClick={() => setActiveTab("brain")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-medium border border-slate-800 transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Settings Room</span>
                </button>
              </div>
            </div>
          )}

        {/* Loading State */}
        {loading && !currentWs && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-200 font-semibold">Loading your Business Control Room...</p>
            <p className="text-xs text-slate-400">Syncing database, WhatsApp instance, and AI catalog</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !currentWs && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
              <Building2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">No Business Workspace Found</h3>
              <p className="text-xs text-slate-400">
                You do not have an active business workspace linked yet. Create your workspace now to activate your 24/7 AI WhatsApp bot.
              </p>
            </div>
            <button
              onClick={() => setShowNewWsModal(true)}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              + Create Business Workspace
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW */}
        {/* ============================================================== */}
        {activeTab === "overview" && currentWs && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Captured WhatsApp Leads</span>
                  <Users className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">{leads.length}</div>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto-saved with intent & context
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Voice Calls Handled</span>
                  <PhoneCall className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-bold text-white">{callLogs.length}</div>
                <p className="text-[11px] text-slate-400">
                  Full audio recording & transcripts
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Active Keyword Triggers</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">{rules.length}</div>
                <p className="text-[11px] text-slate-400">
                  Instant zero-latency responses
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Hotline Availability</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">100% Active</div>
                <p className="text-[11px] text-slate-400">
                  Nigerian Pidgin, English & Yoruba
                </p>
              </div>
            </div>

            {/* Recent Leads & Recent Calls */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Captured Leads */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
                    <Users className="w-4 h-4 text-emerald-400" /> Recent Auto-Saved Leads
                  </h3>
                  <button
                    onClick={() => setActiveTab("leads")}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                  >
                    View All <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {leads.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs space-y-2">
                    <Users className="w-8 h-8 mx-auto opacity-30" />
                    <p>No leads captured yet. Send a message to test!</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {leads.slice(0, 5).map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-slate-850 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-200">
                              {lead.name || "Anonymous Contact"}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                              +{lead.phone}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {lead.intent_summary || lead.last_message || "Inquired about services"}
                          </p>
                        </div>
                        <a
                          href={`https://wa.me/${lead.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/20 transition whitespace-nowrap"
                        >
                          Chat
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Voice Call Recordings */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white flex items-center gap-2 text-sm sm:text-base">
                    <PhoneCall className="w-4 h-4 text-teal-400" /> Recent Hotline Calls
                  </h3>
                  <button
                    onClick={() => setActiveTab("hotline")}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                  >
                    Hotline Settings <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {callLogs.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs space-y-2">
                    <PhoneCall className="w-8 h-8 mx-auto opacity-30" />
                    <p>No voice calls logged yet. Tap &apos;Open Hotline&apos; to test live WebRTC!</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {callLogs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="bg-slate-850 border border-slate-800 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-200">
                              {log.caller_name || "Caller"}
                            </span>
                            {log.caller_phone && (
                              <span className="text-xs text-slate-400 font-mono">
                                +{log.caller_phone}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-teal-400 font-mono">
                            {Math.floor(log.duration_seconds / 60)}m {log.duration_seconds % 60}s
                          </span>
                        </div>
                        {log.summary && (
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {log.summary}
                          </p>
                        )}
                        {log.recording_url && (
                          <div className="pt-1">
                            <audio
                              controls
                              src={log.recording_url}
                              className="w-full h-8 rounded"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: WHATSAPP CONNECT */}
        {/* ============================================================== */}
        {activeTab === "whatsapp" && currentWs && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                    Connect Your Business WhatsApp Number
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Link your active WhatsApp number via QR code so Obey can auto-reply, take orders, and capture leads 24/7.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      waState === "connected"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        waState === "connected"
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-amber-400"
                      }`}
                    />
                    {waState === "connected" ? "Connected & Active" : "Not Linked / Scan QR"}
                  </span>

                  <button
                    onClick={handleInitWhatsApp}
                    disabled={waLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${waLoading ? "animate-spin" : ""}`} />
                    <span>{waLoading ? "Generating..." : "Generate New QR"}</span>
                  </button>
                </div>
              </div>

              {/* Status Display */}
              {waState === "connected" ? (
                <div className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-4 max-w-xl mx-auto">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">
                      WhatsApp Instance Linked Successfully!
                    </h3>
                    <p className="text-xs text-slate-300">
                      Your business instance <span className="font-mono text-emerald-400 font-semibold">{currentWs.whatsapp_instance_name || `obey-${currentWs.slug}`}</span> is active and listening on our Render cloud gateway.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
                    <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3">
                      <span className="text-[11px] text-emerald-400 block font-semibold">Connected Business Number</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {waConnectedNumber ? `+${waConnectedNumber}` : "Detecting..."}
                      </span>
                      {waProfileName && (
                        <span className="text-[10px] text-slate-400 block truncate mt-0.5" title={waProfileName}>
                          {waProfileName}
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 block">Owner Phone</span>
                      <span className="text-xs font-mono font-bold text-slate-200">+{currentWs.owner_phone}</span>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 block">24/7 AI Auto-Reply</span>
                      <span className="text-xs font-semibold text-emerald-400">Enabled (Autonomous)</span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                    <a
                      href={`https://wa.me/${waConnectedNumber || currentWs.owner_phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Send Test Message</span>
                    </a>

                    <button
                      onClick={() => handleDisconnectWhatsApp("code")}
                      disabled={waLoading}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition border border-amber-500/30 disabled:opacity-50"
                      title="Disconnect and switch to 8-digit Pairing Code (Plan B)"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Reconnect with 8-Digit Code (Plan B)</span>
                    </button>

                    <button
                      onClick={() => handleDisconnectWhatsApp("qr")}
                      disabled={waLoading}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition border border-slate-700 disabled:opacity-50"
                      title="Disconnect and scan a fresh QR code"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Rescan QR (Plan A)</span>
                    </button>

                    <button
                      onClick={() => handleDisconnectWhatsApp("code")}
                      disabled={waLoading}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium text-xs flex items-center gap-1.5 transition border border-rose-500/20 disabled:opacity-50"
                      title="Unlink and disconnect this WhatsApp instance"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Dedicated Business Number Best-Practice Banner */}
                  <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-amber-950/30 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3.5 shadow-lg">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30 text-lg">
                      💡
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white">
                          Owner Tip: Link a Dedicated Business Number
                        </h4>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold px-2 py-0.5 rounded-full uppercase">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        We strongly advise using a <strong>dedicated secondary SIM or WhatsApp Business line</strong> as Obey&apos;s bot number.
                        This allows you (the owner) to message Obey from your personal WhatsApp to test pricing, command the AI, and control your business hotline seamlessly without interfering with your personal chats.
                      </p>
                    </div>
                  </div>

                  {/* Connection Method Switcher (Plan B vs Plan A) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-white block">Choose How to Link:</span>
                      <span className="text-[11px] text-slate-400">
                        {waConnectMethod === "code"
                          ? "📱 Plan B: Recommended if you are on mobile or only have 1 device."
                          : "📷 Plan A: Scan QR code using your phone camera (requires 2 devices or PC)."}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-700/80 rounded-xl shrink-0">
                      <button
                        type="button"
                        onClick={() => setWaConnectMethod("code")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          waConnectMethod === "code"
                            ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>8-Digit Code (Plan B)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWaConnectMethod("qr");
                          if (!waQrCode) handleInitWhatsApp();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          waConnectMethod === "qr"
                            ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Scan QR (Plan A)</span>
                      </button>
                    </div>
                  </div>

                  {/* PLAN B: 8-DIGIT PAIRING CODE (SINGLE DEVICE) */}
                  {waConnectMethod === "code" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      {/* Step-by-step instructions for pairing code */}
                      <div className="lg:col-span-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                            📱
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-sm sm:text-base">
                              Link with Phone Number (No 2nd Device Needed)
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              Connect WhatsApp directly on this phone in 5 quick steps:
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              1
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Open WhatsApp on this phone
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Works on personal WhatsApp or WhatsApp Business (Android &amp; iPhone).
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              2
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Go to Linked Devices
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings</strong> on iPhone, then select <strong>Linked Devices</strong>.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              3
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Tap &quot;Link a Device&quot;
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Confirm your fingerprint / PIN if your phone prompts you.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 p-3 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                              4
                            </span>
                            <div>
                              <p className="text-xs font-bold text-amber-300">
                                Tap &quot;Link with phone number instead&quot;
                              </p>
                              <p className="text-[11px] text-slate-300">
                                Look at the bottom of the QR scanner camera screen in WhatsApp and tap the text link.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              5
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Enter the 8-character code
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Enter the code generated on the right. Your WhatsApp links within 5 seconds!
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Cloud-Powered by Evolution API</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Instance: <span className="font-mono text-slate-300">{currentWs.whatsapp_instance_name || `obey-${currentWs.slug}`}</span>. No need to keep your browser open — Obey runs autonomously in the cloud 24/7.
                          </p>
                        </div>
                      </div>

                      {/* Pairing Code Generator & Display Card */}
                      <div className="lg:col-span-6 bg-slate-850 border border-slate-800 rounded-2xl p-6 space-y-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-200 mb-1.5">
                            Enter Your WhatsApp Phone Number
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="tel"
                                value={waPhoneNumber}
                                onChange={(e) => setWaPhoneNumber(e.target.value)}
                                placeholder="e.g. 2348120934828"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                              />
                            </div>
                            <button
                              onClick={() => handleGeneratePairingCode()}
                              disabled={waPairingLoading}
                              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition disabled:opacity-50 shrink-0 shadow-lg shadow-amber-500/20"
                            >
                              {waPairingLoading ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Generating...</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>Get 8-Digit Code</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Include your country code without + or spaces (e.g. 234 for Nigeria, 44 for UK, 1 for US).
                          </p>
                        </div>

                        {waPairingError && (
                          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                            {waPairingError}
                          </div>
                        )}

                        {/* Big Code Card */}
                        {waPairingCode ? (
                          <div className="p-6 bg-slate-900 border-2 border-amber-500/40 rounded-2xl text-center space-y-4 shadow-xl">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                                Enter this code into WhatsApp
                              </span>
                              <div className="py-2">
                                <span className="text-3xl sm:text-4xl font-mono font-extrabold text-white tracking-widest select-all">
                                  {waPairingCode.length === 8
                                    ? `${waPairingCode.slice(0, 4)} - ${waPairingCode.slice(4)}`
                                    : waPairingCode}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                WhatsApp &gt; Linked Devices &gt; Link with phone number instead &gt; enter above code.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                              <button
                                onClick={handleCopyPairingCode}
                                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-amber-500/25"
                              >
                                {waCopiedCode ? (
                                  <>
                                    <Check className="w-4 h-4 text-emerald-950" />
                                    <span>Copied to Clipboard!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4" />
                                    <span>Copy 8-Digit Code</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleGeneratePairingCode()}
                                disabled={waPairingLoading}
                                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition"
                              >
                                Request New Code
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 border-2 border-dashed border-slate-700/80 rounded-2xl text-center space-y-2 text-slate-400">
                            <Smartphone className="w-10 h-10 mx-auto text-slate-600" />
                            <p className="text-xs font-medium text-slate-300">
                              No code generated yet
                            </p>
                            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                              Verify your phone number above and click <strong>&quot;Get 8-Digit Code&quot;</strong> to link this phone without a second device.
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Waiting for you to enter code in WhatsApp (checks every 5s)...</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* PLAN A: QR CODE (2 DEVICES) */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                      {/* Step-by-step instructions */}
                      <div className="lg:col-span-7 space-y-4">
                        <h3 className="font-bold text-white text-sm sm:text-base">
                          How to link your WhatsApp via QR code:
                        </h3>

                        <div className="space-y-3">
                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3.5 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              1
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Open WhatsApp on your phone
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Works on WhatsApp Messenger, WhatsApp Business, iOS, and Android.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3.5 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              2
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Navigate to Linked Devices
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings</strong> on iPhone, then select <strong>Linked Devices</strong>.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 bg-slate-850 border border-slate-800 p-3.5 rounded-xl">
                            <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              3
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">
                                Tap &quot;Link a Device&quot; and scan the QR code
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Point your camera at the QR code on the right. Once scanned, your instance links automatically!
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Cloud-Powered by Evolution API</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Instance Name: <span className="font-mono text-slate-300">{currentWs.whatsapp_instance_name || `obey-${currentWs.slug}`}</span>. You don&apos;t need to keep your laptop or browser open — our cloud server keeps it running 24/7.
                          </p>
                        </div>
                      </div>

                      {/* QR Code Container */}
                      <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-850 border border-slate-800 rounded-2xl space-y-4 text-center">
                        {waQrCode ? (
                          <div className="p-3 bg-white rounded-2xl shadow-2xl inline-block">
                            <img
                              src={waQrCode.startsWith("data:") ? waQrCode : `data:image/png;base64,${waQrCode}`}
                              alt="WhatsApp Link QR Code"
                              className="w-56 h-56 object-contain rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="w-56 h-56 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 space-y-3 text-slate-400">
                            <MessageSquare className="w-12 h-12 text-slate-600" />
                            <p className="text-xs">
                              {waLoading ? "Initializing instance..." : "No active QR code. Click button below to generate."}
                            </p>
                          </div>
                        )}

                        <button
                          onClick={handleInitWhatsApp}
                          disabled={waLoading}
                          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {waLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Generating QR Code...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              <span>{waQrCode ? "Refresh QR Code" : "Generate WhatsApp QR Code"}</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                          <span>Checking connection status every 5 seconds...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: WHATSAPP STATUS AUTOMATOR */}
        {/* ============================================================== */}
        {activeTab === "status" && currentWs && (
          <div className="space-y-6">
            {/* Top Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
              <div className="relative z-10 max-w-3xl space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 uppercase tracking-wider flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-pulse" /> Live Broadcast
                  </span>
                  <span className="text-xs text-emerald-400 font-medium">WhatsApp Status Stories Engine</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Autonomous WhatsApp Status Automator
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Turn your WhatsApp Status into a 24/7 revenue engine. Compose, generate with AI, or set automated daily promotions that publish directly to your stories (<code className="text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded">status@broadcast</code>).
                </p>
              </div>
            </div>

            {/* Success & Error Notifications */}
            {statusSuccessMsg && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{statusSuccessMsg}</span>
              </div>
            )}
            {statusErrorMsg && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{statusErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Instant Status Composer & AI Generator (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Send className="w-4 h-4 text-emerald-400" />
                      Post WhatsApp Status Story
                    </h3>
                    <button
                      onClick={() => handleGenerateAiStatus()}
                      disabled={generatingStatus}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${generatingStatus ? "animate-spin" : ""}`} />
                      <span>{generatingStatus ? "Thinking..." : "✨ AI Generate"}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Status Text Story <span className="text-slate-500">({statusContent.length} chars)</span>
                      </label>
                      <textarea
                        rows={4}
                        value={statusContent}
                        onChange={(e) => setStatusContent(e.target.value)}
                        placeholder={`e.g. 🔥 Flash Friday Promo at ${currentWs.name}!\n\nGet 20% off our bestsellers today only. Send us a message to lock in your spot now! 🚀`}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none transition font-sans"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          Status Media (Image or Video)
                        </label>
                        {statusMediaUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusMediaUrl("");
                              setMediaFileName("");
                            }}
                            className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
                          >
                            <X className="w-3 h-3" />
                            <span>Remove Media</span>
                          </button>
                        )}
                      </div>

                      {/* File Upload Dropzone / Picker */}
                      {!statusMediaUrl ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingMedia(true);
                          }}
                          onDragLeave={() => setIsDraggingMedia(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingMedia(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleSelectMediaFile(file);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition flex flex-col items-center justify-center gap-2 ${
                            isDraggingMedia
                              ? "border-emerald-400 bg-emerald-500/10"
                              : "border-slate-800 hover:border-emerald-500/50 bg-slate-950/60"
                          } ${uploadingMedia ? "opacity-60 pointer-events-none" : ""}`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleSelectMediaFile(file);
                              e.target.value = "";
                            }}
                          />

                          {uploadingMedia ? (
                            <div className="flex flex-col items-center gap-2 py-2">
                              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                              <span className="text-xs font-semibold text-emerald-300">
                                {uploadProgress !== null
                                  ? `Uploading & compressing media (${uploadProgress}%)...`
                                  : "Uploading & compressing media to WhatsApp standard..."}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400 shadow-sm">
                                <UploadCloud className="w-5 h-5" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-slate-200">
                                  Click to upload or drag & drop photo/video
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  Supports JPG, PNG, WEBP, MP4, MOV (Trim up to 1:30s max with auto-compression)
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px] uppercase tracking-wider">
                              {statusMediaType === "video" ? (
                                <>
                                  <Video className="w-3.5 h-3.5" /> Video Story (Max 1:30s Compressed)
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="w-3.5 h-3.5" /> Photo Story
                                </>
                              )}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {mediaFileName || "Uploaded Asset"}
                            </span>
                          </div>

                          <div className="rounded-lg overflow-hidden bg-black/80 border border-slate-800 flex items-center justify-center max-h-40 sm:max-h-44">
                            {statusMediaType === "video" ? (
                              <video
                                src={statusMediaUrl}
                                controls
                                className="max-h-40 sm:max-h-44 w-auto object-contain rounded-lg"
                              />
                            ) : (
                              <img
                                src={statusMediaUrl}
                                alt="Status Preview"
                                className="max-h-40 sm:max-h-44 w-auto object-contain rounded-lg"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Interactive WhatsApp Video Trimmer & Compressor Modal */}
                      {showVideoTrimmer && pendingVideoFile && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
                          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                            {/* Modal Header */}
                            <div className="shrink-0 flex items-center justify-between border-b border-slate-800 p-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <Scissors className="w-4 h-4" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-white">WhatsApp Video Trimmer</h4>
                                  <p className="text-[11px] text-slate-400">Limit: 1:30s max • Auto-compressed for WhatsApp</p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setShowVideoTrimmer(false);
                                  if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                                  setVideoPreviewUrl("");
                                  setPendingVideoFile(null);
                                }}
                                className="text-slate-400 hover:text-white p-1 rounded-lg"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Scrollable Content Body */}
                            <div className="overflow-y-auto p-4 space-y-3.5 flex-1">
                              {/* Video Preview */}
                              <div className="bg-black/95 rounded-xl overflow-hidden flex items-center justify-center max-h-40 sm:max-h-48 border border-slate-800">
                                <video
                                  ref={videoPlayerRef}
                                  src={videoPreviewUrl}
                                  controls
                                  className="max-h-40 sm:max-h-48 w-full object-contain"
                                />
                              </div>

                              {/* WhatsApp-Style Draggable Timeline Scrubber */}
                              <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                                {/* Header with time & size indicator matching WhatsApp */}
                                <div className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                                    <span>🔊</span>
                                    <span>{formatSeconds(Math.max(1, trimEnd - trimStart))}</span>
                                    <span className="text-slate-500">•</span>
                                    <span className="text-slate-400 font-mono">
                                      ~{(((Math.max(1, trimEnd - trimStart)) / 90) * 5.6).toFixed(1)} MB
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    Clip: <span className="font-mono text-white font-semibold">{formatSeconds(trimStart)}</span> → <span className="font-mono text-white font-semibold">{formatSeconds(trimEnd)}</span> <span className="text-slate-500 font-mono">(Total: {formatSeconds(videoDuration)})</span>
                                  </span>
                                </div>

                                {/* Draggable Filmstrip Track */}
                                <div
                                  ref={timelineTrackRef}
                                  onPointerMove={handleTimelinePointerMove}
                                  onPointerUp={handleTimelinePointerUp}
                                  className="relative h-14 sm:h-16 w-full rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden select-none touch-none cursor-pointer"
                                >
                                  {/* Background Filmstrip Simulation */}
                                  <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-30">
                                    {Array.from({ length: 10 }).map((_, i) => (
                                      <div key={i} className="h-10 w-8 sm:w-10 rounded border border-slate-600 bg-slate-800/60 flex items-center justify-center">
                                        <span className="text-[8px] text-slate-500">▶</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Left Dimmed Area */}
                                  <div
                                    className="absolute top-0 bottom-0 left-0 bg-black/80 z-10 pointer-events-none"
                                    style={{
                                      width: `${videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0}%`,
                                    }}
                                  />

                                  {/* Right Dimmed Area */}
                                  <div
                                    className="absolute top-0 bottom-0 right-0 bg-black/80 z-10 pointer-events-none"
                                    style={{
                                      width: `${videoDuration > 0 ? Math.max(0, 100 - ((trimEnd / videoDuration) * 100)) : 0}%`,
                                    }}
                                  />

                                  {/* Draggable Selection Window */}
                                  <div
                                    onPointerDown={(e) => handleTimelinePointerDown("window", e)}
                                    className="absolute top-0 bottom-0 z-20 border-y-[3px] border-emerald-400 bg-emerald-400/15 cursor-grab active:cursor-grabbing flex items-stretch justify-between shadow-lg"
                                    style={{
                                      left: `${videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0}%`,
                                      width: `${videoDuration > 0 ? (Math.max(1, trimEnd - trimStart) / videoDuration) * 100 : 100}%`,
                                    }}
                                  >
                                    {/* Left Drag Handle */}
                                    <div
                                      onPointerDown={(e) => handleTimelinePointerDown("left", e)}
                                      className="w-5 sm:w-6 bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex flex-col items-center justify-center cursor-ew-resize shrink-0 rounded-l select-none transition shadow-md"
                                      title="Drag to adjust start"
                                    >
                                      <div className="w-1 h-4 bg-slate-900/60 rounded-full" />
                                    </div>

                                    {/* Center Window Label / Drag hint */}
                                    <div className="flex-1 flex items-center justify-center pointer-events-none select-none">
                                      <span className="px-2 py-0.5 rounded-full bg-slate-950/80 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                                        {formatSeconds(trimEnd - trimStart)}
                                      </span>
                                    </div>

                                    {/* Right Drag Handle */}
                                    <div
                                      onPointerDown={(e) => handleTimelinePointerDown("right", e)}
                                      className="w-5 sm:w-6 bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex flex-col items-center justify-center cursor-ew-resize shrink-0 rounded-r select-none transition shadow-md"
                                      title="Drag to adjust end"
                                    >
                                      <div className="w-1 h-4 bg-slate-900/60 rounded-full" />
                                    </div>
                                  </div>
                                </div>

                                <p className="text-[10px] text-slate-400 text-center">
                                  Drag center window to slide anywhere across video • Drag handles to shorten clip (max 1:30s).
                                </p>

                                {/* Quick Segment Presets */}
                                {videoDuration > 90 && (
                                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 border-t border-slate-800 text-[11px]">
                                    <span className="text-slate-400 font-medium">Quick Pick:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTrimStart(0);
                                        setTrimEnd(Math.min(videoDuration, 90));
                                        if (videoPlayerRef.current) videoPlayerRef.current.currentTime = 0;
                                      }}
                                      className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                                    >
                                      First 1:30s
                                    </button>
                                    {videoDuration > 150 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const midStart = Math.max(0, Math.floor(videoDuration / 2) - 45);
                                          setTrimStart(midStart);
                                          setTrimEnd(Math.min(videoDuration, midStart + 90));
                                          if (videoPlayerRef.current) videoPlayerRef.current.currentTime = midStart;
                                        }}
                                        className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                                      >
                                        Middle 1:30s
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const endStart = Math.max(0, videoDuration - 90);
                                        setTrimStart(endStart);
                                        setTrimEnd(videoDuration);
                                        if (videoPlayerRef.current) videoPlayerRef.current.currentTime = endStart;
                                      }}
                                      className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                                    >
                                      Last 1:30s
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="shrink-0 flex items-center gap-3 p-3.5 bg-slate-950 border-t border-slate-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowVideoTrimmer(false);
                                  if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                                  setVideoPreviewUrl("");
                                  setPendingVideoFile(null);
                                }}
                                className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs transition"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={uploadingMedia}
                                onClick={() => {
                                  if (pendingVideoFile) {
                                    uploadMediaAsset(pendingVideoFile, trimStart, trimEnd);
                                  }
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {uploadingMedia ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>
                                      {uploadProgress !== null
                                        ? `Uploading & Compressing (${uploadProgress}%)...`
                                        : "Compressing & Uploading..."}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Scissors className="w-4 h-4" />
                                    <span>✂️ Use Selected {formatSeconds(trimEnd - trimStart)}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handlePostStatus()}
                      disabled={postingStatus || uploadingMedia || (!statusContent.trim() && !statusMediaUrl.trim())}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {postingStatus ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Publishing to WhatsApp Status...</span>
                        </>
                      ) : uploadingMedia ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Uploading Media File...</span>
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4" />
                          <span>🚀 Post to WhatsApp Status Stories Now</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Generated Variations */}
                  {aiVariations.length > 0 && (
                    <div className="pt-4 border-t border-slate-800 space-y-3">
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Generated Status Ideas for {currentWs.name}:</span>
                      </div>
                      <div className="space-y-2.5">
                        {aiVariations.map((v, i) => (
                          <div
                            key={i}
                            className="bg-slate-950 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl space-y-2 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {v.type}
                              </span>
                              <button
                                onClick={() => {
                                  setStatusContent(v.content);
                                  setStatusSuccessMsg(`Variation "${v.type}" copied to composer!`);
                                  setTimeout(() => setStatusSuccessMsg(""), 3000);
                                }}
                                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Use This</span>
                              </button>
                            </div>
                            <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                              {v.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-300">💡 Remote WhatsApp Command:</p>
                    <p>
                      You don't even need to open this dashboard! Whenever you want to post a status, just message your connected WhatsApp number from your registered phone:
                    </p>
                    <code className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/60 block mt-1 font-mono">
                      Post status: We are open today! 10% off for all early birds.
                    </code>
                  </div>
                </div>
              </div>

              {/* Right Column: Automated Schedule & History (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                {/* Schedule Preferences Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Autonomous Auto-Post Schedule
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Let Obey AI draft and post promotional updates automatically to keep your brand top-of-mind.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                      <div>
                        <span className="text-xs font-semibold text-white block">Auto-Post Engine</span>
                        <span className="text-[11px] text-slate-400">
                          {autoStatusEnabled ? "Active & Publishing" : "Disabled (Manual Only)"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoStatusEnabled(!autoStatusEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          autoStatusEnabled ? "bg-emerald-500" : "bg-slate-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            autoStatusEnabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Broadcast Frequency
                      </label>
                      <select
                        value={autoStatusInterval}
                        onChange={(e) => setAutoStatusInterval(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                      >
                        <option value="daily_morning">Daily (Morning 9:00 AM WAT)</option>
                        <option value="twice_daily">2x Daily (Morning 9 AM & Evening 6 PM)</option>
                        <option value="thrice_daily">3x Daily (Morning, Afternoon, Evening)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleSaveStatusSchedule}
                      disabled={savingStatusSchedule}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{savingStatusSchedule ? "Saving..." : "Save Schedule Preferences"}</span>
                    </button>
                  </div>
                </div>

                {/* Autonomous Status Engagement Suite */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-4">
                  <div className="border-b border-zinc-800 pb-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                        <Eye className="w-4 h-4 text-emerald-400" />
                        Status Viewing & AI Commenting
                      </h3>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        autoViewStatus && autoCommentStatus
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                      }`}>
                        {autoViewStatus && autoCommentStatus ? "Active" : "Off"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Regulate whether Obey automatically views contacts&apos; WhatsApp status stories and posts intelligent, warm reactions to keep your business visible.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Unified Single Toggle: Viewing & Commenting Combined */}
                    <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
                      <div className="space-y-0.5 pr-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs font-semibold text-white">Auto-View & AI Status Commenting</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-tight">
                          Automatically view contacts&apos; status stories in real-time and post warm, supportive reactions (rate-limited to keep your account safe and natural).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleStatusEngagement}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          autoViewStatus && autoCommentStatus ? "bg-emerald-500" : "bg-zinc-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            autoViewStatus && autoCommentStatus ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Status Engagement Options (only shown when enabled) */}
                    {autoViewStatus && autoCommentStatus ? (
                      <>
                        {/* Comment Tone Selector */}
                        <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                          <label className="block text-[11px] font-medium text-zinc-400">
                            Comment Personality / Tone:
                          </label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { id: "friendly", label: "Warm & Friendly" },
                              { id: "professional", label: "Professional" },
                              { id: "hype", label: "Hype & Fun" },
                            ].map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => handleSetCommentTone(t.id)}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition ${
                                  commentTone === t.id
                                    ? "bg-white text-black border-white shadow-sm font-bold"
                                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Rate Limiting Controls */}
                        <div className="pt-2.5 border-t border-zinc-800 space-y-2">
                          {currentWs.slug === "femi" || currentWs.id === "femi" ? (
                            /* Main Obey - Custom / Unlimited Rate Limiting */
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="block text-[11px] font-bold text-white flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                                  Rate Limiting (Main Obey Mode):
                                </label>
                                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                  {commentRateLimit === "unlimited" ? "🚀 Unlimited Active" : `Every ${commentRateLimit}`}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-tight">
                                Pick how frequently Obey reacts to contacts&apos; status stories. Choose <strong>Unlimited</strong> to comment on all statuses (with a 2-min anti-spam safety debounce).
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                                {[
                                  { id: "unlimited", label: "🚀 Unlimited" },
                                  { id: "1h", label: "⏱️ Every 1h" },
                                  { id: "4h", label: "⏱️ Every 4h" },
                                  { id: "12h", label: "⏱️ Every 12h" },
                                  { id: "24h", label: "⏱️ Every 24h" },
                                ].map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => handleSetCommentRateLimit(r.id)}
                                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition ${
                                      commentRateLimit === r.id
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20"
                                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                                    }`}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : currentWs.plan === "enterprise" || currentWs.plan === "founder" || currentWs.plan === "lifetime" ? (
                            /* Enterprise Business Plan - Priority / Custom rate */
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="block text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                                  Enterprise Rate Control:
                                </label>
                                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                  👑 Enterprise Unlocked
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                                {[
                                  { id: "unlimited", label: "🚀 Unlimited" },
                                  { id: "1h", label: "⏱️ Every 1h" },
                                  { id: "4h", label: "⏱️ Every 4h" },
                                  { id: "8h", label: "⏱️ Every 8h" },
                                ].map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => handleSetCommentRateLimit(r.id)}
                                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition ${
                                      commentRateLimit === r.id
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
                                    }`}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : currentWs.plan === "pro" ? (
                            /* Pro Plan - 8h cooldown badge */
                            <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                  Pro Plan Rate Limit
                                </span>
                                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                  1 Comment / 8 hrs (Max 35/day)
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-tight">
                                Your Pro plan allows high-frequency status engagement with a smart 8-hour cooldown per contact.
                              </p>
                              <div className="pt-1 flex items-center justify-between text-[10px]">
                                <span className="text-zinc-400">Want 100% Unlimited status commenting?</span>
                                <button
                                  type="button"
                                  onClick={() => handleCheckoutPlan("enterprise")}
                                  className="text-amber-400 hover:text-amber-300 font-bold underline"
                                >
                                  Upgrade to Enterprise &rarr;
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Starter Plan - 24h cooldown badge */
                            <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                                  Starter Plan Rate Limit
                                </span>
                                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                  1 Comment / 24 hrs (Max 10/day)
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-tight">
                                Starter workspaces are limited to 1 comment per contact every 24 hours to protect your WhatsApp number from spam flags.
                              </p>
                              <div className="pt-1 flex items-center justify-between text-[10px]">
                                <span className="text-zinc-400">Need faster engagement or unlimited comments?</span>
                                <button
                                  type="button"
                                  onClick={() => handleCheckoutPlan("pro")}
                                  className="text-emerald-400 hover:text-emerald-300 font-bold underline"
                                >
                                  Upgrade to Pro &rarr;
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-3.5 bg-zinc-900/30 border border-zinc-800/60 rounded-xl text-center">
                        <p className="text-[11px] text-zinc-500">
                          Status viewing and AI commenting are currently inactive. Obey will neither view nor comment on any contact stories.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Published Stories Log - Vercel Deployments Style */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <div>
                      <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        Status Broadcast Deployments ({statuses.length})
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        Live stories deployed to your WhatsApp Status audience.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded-md font-mono">
                        Author: Obey AI
                      </span>
                      <span className="text-[10px] bg-blue-600/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        Production
                      </span>
                    </div>
                  </div>

                  {statuses.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-xs space-y-2 border border-dashed border-zinc-800/80 rounded-xl">
                      <Radio className="w-8 h-8 mx-auto text-zinc-600" />
                      <p>No status stories published yet. Compose your first status broadcast on the left!</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 max-h-96 overflow-y-auto pr-1">
                      {statuses.slice(0, 15).map((st, i) => (
                        <div
                          key={st.id || i}
                          className="py-3 px-2 sm:px-3 hover:bg-zinc-900/40 rounded-xl transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                                <span className={`w-2 h-2 rounded-full ${st.status === "failed" ? "bg-rose-500" : "bg-emerald-400 animate-pulse"}`} />
                                {st.status === "failed" ? (
                                  <span className="text-rose-400">Failed</span>
                                ) : (
                                  <span>Published</span>
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] tracking-wide uppercase">
                                Production
                              </span>
                              <span className="font-mono text-[11px] text-zinc-500">
                                -o- {(st.id || "").slice(-7) || "live"}
                              </span>
                            </div>

                            {st.content && (
                              <p className="text-zinc-200 line-clamp-2 text-xs font-sans leading-relaxed">
                                {st.content}
                              </p>
                            )}

                            {st.media_url && (
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className="text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                                  {st.media_type === "video" ? "🎬 Video Story" : "📸 Photo Story"}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0 text-zinc-500 text-[11px] justify-between sm:justify-end">
                            <span className="font-mono">
                              {st.posted_at ? new Date(st.posted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                            </span>
                            <span className="text-zinc-600 font-mono text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                              main
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: AI BRAIN & CATALOG */}
        {/* ============================================================== */}
        {/* ============================================================== */}
        {/* TAB: SETTINGS ROOM (AI BRAIN & COMMERCIAL CATALOG) */}
        {/* ============================================================== */}
        {activeTab === "brain" && settings && (
          <div className="space-y-6">
            {/* Top Vercel Settings Header */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Settings Room · Knowledge & Behavior
                  </h2>
                </div>
                <p className="text-xs text-zinc-400">
                  Configure Obey&apos;s intelligence, commercial knowledge, and autonomous behavior for <strong className="text-zinc-200">{currentWs?.name}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs sm:text-sm transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  ) : saveSuccess ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Save className="w-4 h-4 text-black" />
                  )}
                  <span>{saveSuccess ? "Saved Successfully!" : savingSettings ? "Saving..." : "Save Settings"}</span>
                </button>
              </div>
            </div>

            {/* Structured Settings Cards Suite */}
            <div className="space-y-5">
              {/* Card 1: Business Identity & Overview */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-amber-400" />
                      1. Business Profile & Core Value Proposition
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      What does your company do? What is your mission, operational hours, and key benefits?
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {(settings.business_bio || "").length} characters
                  </span>
                </div>

                {/* Quick Bio Preset Chips */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">
                    Quick-Fill Presets (Click to insert):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertBioTemplate("services")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-[11px] border border-zinc-800 transition"
                    >
                      ✨ Professional Services
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertBioTemplate("retail")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-[11px] border border-zinc-800 transition"
                    >
                      ✨ Retail & E-Commerce
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertBioTemplate("training")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-[11px] border border-zinc-800 transition"
                    >
                      ✨ Training & Mentorship
                    </button>
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={settings.business_bio || ""}
                  onChange={(e) => setSettings({ ...settings, business_bio: e.target.value })}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-200 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none leading-relaxed transition"
                  placeholder="e.g. Havilah Touch is a leading agricultural development and training enterprise in Ibadan. Open Mon-Sat 8am-6pm. We build smart greenhouses, conduct educational farm workshops, and supply organic produce..."
                />
              </div>

              {/* Card 2: Commercial Catalog, Pricing & Payment Info */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      2. Products, Pricing & Bank Payment Accounts
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Obey quotes prices and shares bank payment details directly from this section during customer chats.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {(settings.catalog_summary || "").length} characters
                  </span>
                </div>

                {/* Quick Add Snippets */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">
                    Quick-Add Helpers (Click to append snippet):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAppendCatalog("• Standard Package: ₦25,000 — Includes 1-month full access & onboarding.")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-emerald-400 text-[11px] border border-zinc-800 transition"
                    >
                      ➕ Add Service Package
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppendCatalog("• Bank Transfer: Bank Name | Account Number: 0123456789 | Account Name: Business Name")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-emerald-400 text-[11px] border border-zinc-800 transition"
                    >
                      💳 Add Bank Details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppendCatalog("• Delivery Policy: Lagos within 24-48 hours (₦2,500), Nationwide within 3-5 days (₦4,500).")}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-emerald-400 text-[11px] border border-zinc-800 transition"
                    >
                      🚚 Add Delivery Terms
                    </button>
                  </div>
                </div>

                <textarea
                  rows={7}
                  value={settings.catalog_summary || ""}
                  onChange={(e) => setSettings({ ...settings, catalog_summary: e.target.value })}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-200 font-mono focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none leading-relaxed transition"
                  placeholder="• Starter Package: ₦15,000&#10;• Pro Package: ₦45,000&#10;• Direct Bank: Zenith Bank, 1029384756 (Havilah Enterprises)"
                />
              </div>

              {/* Card 3: WebRTC Voice Call Hotline Settings */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-teal-400" />
                      3. WebRTC Voice Call Hotline & AI Voice Profile
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Configure Obey&apos;s spoken voice accent, gender, personality style, and opening greeting for your live WebRTC phone link.
                    </p>
                  </div>
                  {hotlineUrl && (
                    <Link
                      href={hotlineUrl}
                      target="_blank"
                      className="text-xs text-teal-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Test Live Call &rarr;
                    </Link>
                  )}
                </div>

                {/* Voice Accent & Gender Selection */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    🎙️ Voice Accent & Gender
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: "nigerian_male", flag: "🇳🇬", label: "Nigerian Male (Default)", desc: "Warm Executive Brother" },
                      { id: "nigerian_female", flag: "🇳🇬", label: "Nigerian Female", desc: "Warm Sister / Lady" },
                      { id: "british_male", flag: "🇬🇧", label: "British Male", desc: "Crisp & Executive" },
                      { id: "british_female", flag: "🇬🇧", label: "British Female", desc: "Polished & Refined" },
                      { id: "american_male", flag: "🇺🇸", label: "American Male", desc: "Silicon Valley Tech" },
                      { id: "american_female", flag: "🇺🇸", label: "American Female", desc: "Friendly & Dynamic" },
                    ].map((v) => {
                      const isSelected = (settings.voice_id || "nigerian_male") === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, voice_id: v.id })}
                          className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                            isSelected
                              ? "bg-teal-500/10 border-teal-500/80 ring-1 ring-teal-500/50"
                              : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-100">
                            <span>{v.flag}</span>
                            <span>{v.label}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{v.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Personality & Speaking Tone */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    🧠 Personality & Speaking Tone
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "professional", emoji: "💼", label: "Professional", desc: "Articulate Executive" },
                      { id: "friendly", emoji: "🤝", label: "Warm Brotherly", desc: "Supportive Friend" },
                      { id: "nigerian_pidgin", emoji: "⚡", label: "Authentic Naija", desc: "Pidgin & Sharp-sharp" },
                      { id: "direct", emoji: "🎯", label: "Direct & Concise", desc: "Zero fluff, punchy" },
                    ].map((p) => {
                      const isSelected = (settings.voice_personality || "professional") === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, voice_personality: p.id })}
                          className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                            isSelected
                              ? "bg-purple-500/10 border-purple-500/80 ring-1 ring-purple-500/50"
                              : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-100">
                            <span>{p.emoji}</span>
                            <span>{p.label}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{p.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Spoken Hotline Opening Greeting */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    📢 Spoken Opening Greeting
                  </label>
                  <textarea
                    rows={3}
                    value={settings.voice_greeting || ""}
                    onChange={(e) => setSettings({ ...settings, voice_greeting: e.target.value })}
                    className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-200 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none leading-relaxed transition"
                    placeholder="Hello! You have reached Havilah Touch. How can I assist you with our agricultural packages today?"
                  />
                </div>
              </div>

              {/* Card 4: WhatsApp Initial Welcome Greeting */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-3.5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    4. WhatsApp Welcome Greeting
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Automated initial greeting sent when a new customer initiates chat on WhatsApp. Supports tags: <code className="text-zinc-300 font-mono text-[10px] bg-zinc-900 px-1 py-0.5 rounded">&#123;name&#125;</code> and <code className="text-zinc-300 font-mono text-[10px] bg-zinc-900 px-1 py-0.5 rounded">&#123;business&#125;</code>.
                  </p>
                </div>

                <textarea
                  rows={3}
                  value={settings.whatsapp_welcome || ""}
                  onChange={(e) => setSettings({ ...settings, whatsapp_welcome: e.target.value })}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-200 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none leading-relaxed transition"
                  placeholder="Hello {name}! Welcome to {business}. I am Obey, your dedicated AI companion. How can we serve you today?"
                />
              </div>

              {/* Card 5: Autonomous Fallback & Escalation Mode */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-3.5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    5. Autonomous Fallback & Escalation Behavior
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Choose what Obey should do when a customer asks a question not documented in your catalog.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: "ai_reply",
                      title: "AI Smart Fallback",
                      desc: "Generates a polite, natural response based on your company bio and general business knowledge.",
                    },
                    {
                      id: "notify_owner",
                      title: "Alert Owner on WhatsApp",
                      desc: `Dispatches an instant WhatsApp alert to the owner (+${currentWs?.owner_phone}) to follow up.`,
                    },
                    {
                      id: "human_handoff",
                      title: "Human Team Takeover",
                      desc: "Informs the customer that a human manager will take over the chat shortly.",
                    },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSettings({ ...settings, fallback_action: option.id })}
                      className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                        (settings.fallback_action || "ai_reply") === option.id
                          ? "bg-zinc-900 text-white border-white shadow-sm"
                          : "bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{option.title}</span>
                        {(settings.fallback_action || "ai_reply") === option.id && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-tight">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile Floating Save Action Bar (md:hidden) */}
            <div className="md:hidden sticky bottom-16 inset-x-0 z-40 pt-2">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm shadow-xl flex items-center justify-center gap-2 border border-zinc-200 transition active:scale-98"
              >
                {savingSettings ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                ) : saveSuccess ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Save className="w-4 h-4 text-black" />
                )}
                <span>{saveSuccess ? "Settings Saved!" : savingSettings ? "Saving Changes..." : "Save Settings Room"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: KEYWORD AUTO-RESPONDERS (WASBOT SUPERCHARGED) */}
        {/* ============================================================== */}
        {activeTab === "rules" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Instant Keyword Responders
                </h2>
                <p className="text-xs text-slate-400">
                  Like Wasbot AI, but integrated directly into Obey with intelligent intent fallback.
                </p>
              </div>

              <button
                onClick={() => setShowNewRuleModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create Keyword Trigger</span>
              </button>
            </div>

            {/* Test Simulator */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Live Rule Simulator
              </h3>
              <p className="text-xs text-slate-500">
                Type any message to see whether it triggers an instant keyword response or falls back to Obey&apos;s AI brain.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runTestSimulation()}
                  placeholder="e.g. How much is your tomato greenhouse?"
                  className="flex-1 bg-slate-850 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={runTestSimulation}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  Simulate
                </button>
              </div>

              {testOutput && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed">
                  {testOutput}
                </div>
              )}
            </div>

            {/* Rules List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {rule.trigger_keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-mono font-medium"
                          >
                            &quot;{kw}&quot;
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {rule.action.replace("_", " ")}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 whitespace-pre-line line-clamp-4 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                      {rule.response_text}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: LEADS CRM */}
        {/* ============================================================== */}
        {activeTab === "leads" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Auto-Saved Leads & Customer CRM
                </h2>
                <p className="text-xs text-slate-400">
                  Every contact who reaches out via WhatsApp or calls your Voice Hotline is automatically saved.
                </p>
              </div>

              {currentWs && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setBroadcastResult(null);
                      setShowBroadcastModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-md shadow-emerald-500/10"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send Broadcast</span>
                  </button>

                  <a
                    href={`/api/obey/workspaces/${currentWs.slug}/leads?format=vcf`}
                    download
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-xs sm:text-sm font-semibold border border-teal-500/30 transition"
                    title="Export .vcf file for 1-tap import into Google Contacts or phone address book"
                  >
                    <Phone className="w-4 h-4 text-teal-400" />
                    <span>Save to Phone (VCF)</span>
                  </a>

                  <a
                    href={`/api/obey/workspaces/${currentWs.slug}/leads?format=csv`}
                    download
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Excel / CSV</span>
                  </a>
                </div>
              )}
            </div>

            {/* Filter and Search */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name, phone, or inquiry notes..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-850 border border-slate-700 rounded-xl p-1 text-xs">
                {["all", "lead", "interested", "purchased"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setLeadStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg capitalize transition ${
                      leadStatusFilter === st
                        ? "bg-emerald-500 text-slate-950 font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Leads Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Phone Number</th>
                    <th className="p-3.5">Source</th>
                    <th className="p-3.5">Interest / Intent</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Direct Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No leads match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-850/60 transition">
                        <td className="p-3.5 font-medium text-slate-200">
                          {lead.name || "Anonymous Contact"}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          +{lead.phone}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">
                            {lead.source}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400 max-w-xs truncate">
                          {lead.intent_summary || lead.last_message || "—"}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
                            {lead.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <a
                            href={`https://wa.me/${lead.phone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/20 transition"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: VOICE HOTLINE & EMBED */}
        {/* ============================================================== */}
        {activeTab === "hotline" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-teal-400" />
                Branded WebRTC Voice Hotline
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Share this direct link with your customers or on your Instagram bio, flyers, and WhatsApp status.
                Customers can talk directly with Obey with zero phone airtime costs!
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="font-mono text-xs sm:text-sm text-emerald-400 break-all select-all">
                  {hotlineUrl}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={copyHotlineLink}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                    <span>{copiedLink ? "Copied" : "Copy"}</span>
                  </button>
                  <Link
                    href={hotlineUrl}
                    target="_blank"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Test Hotline</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Embed Snippet */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                Website Embed Code
              </h3>
              <p className="text-xs text-slate-400">
                Copy and paste this HTML iframe tag onto any website or landing page to embed Obey Voice Hotline.
              </p>
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto select-all">
                {`<iframe\n  src="${hotlineUrl}"\n  width="100%"\n  height="700px"\n  frameborder="0"\n  allow="microphone"\n></iframe>`}
              </pre>
            </div>

            {/* Monetization / Pricing Tiers */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                Monetization & Subscription Plans
              </h3>
              <p className="text-xs text-slate-400">
                Each business owner can subscribe via Paystack to unlock unlimited leads, WhatsApp multi-agent bots, and dedicated WebRTC hotlines.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-850 border border-slate-700 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-400 uppercase">Starter Plan</div>
                    <div className="text-2xl font-black text-white">₦9,500 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                    <ul className="text-xs text-slate-400 space-y-1.5">
                      <li>• Up to 250 auto-saved leads</li>
                      <li>• 10 Keyword Auto-responders</li>
                      <li>• WebRTC Voice Hotline (15 hrs/mo)</li>
                      <li>• CSV & Phone VCF Export</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => handleCheckoutPlan("starter")}
                    disabled={checkoutLoading === "starter"}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 disabled:opacity-50"
                  >
                    {checkoutLoading === "starter" ? "Redirecting..." : "Activate Starter"}
                  </button>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 space-y-3 relative flex flex-col justify-between">
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 uppercase">Popular</span>
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-emerald-400 uppercase">Pro Business</div>
                    <div className="text-2xl font-black text-white">₦22,500 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                    <ul className="text-xs text-slate-300 space-y-1.5">
                      <li>• Unlimited auto-saved leads</li>
                      <li>• 50 Keyword Auto-responders</li>
                      <li>• WebRTC Voice Hotline (50 hrs/mo)</li>
                      <li>• WhatsApp audio recordings & transcripts</li>
                      <li>• Custom Business Catalog & Payment Info</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => handleCheckoutPlan("pro")}
                    disabled={checkoutLoading === "pro"}
                    className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {checkoutLoading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
                  </button>
                </div>

                <div className="bg-slate-850 border border-slate-700 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-400 uppercase">Enterprise / Founder</div>
                    <div className="text-2xl font-black text-white">₦55,000 <span className="text-xs text-slate-400 font-normal">/ month</span></div>
                    <ul className="text-xs text-slate-400 space-y-1.5">
                      <li>• Full Multi-tenant WhatsApp bot</li>
                      <li>• Unlimited Voice Hotline minutes</li>
                      <li>• Autonomous Web App & Document Generator</li>
                      <li>• Priority 24/7 dedicated server support</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => handleCheckoutPlan("enterprise")}
                    disabled={checkoutLoading === "enterprise"}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 disabled:opacity-50"
                  >
                    {checkoutLoading === "enterprise" ? "Redirecting..." : "Activate Enterprise"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>

      {/* ============================================================== */}
      {/* MODAL: SEND WHATSAPP BROADCAST */}
      {/* ============================================================== */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                Dispatch Personalized WhatsApp Broadcast
              </h3>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {broadcastResult ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Broadcast Dispatched Successfully!</span>
                </div>
                <p className="text-xs text-slate-300">
                  Delivered personalized messages to {broadcastResult.dispatchedCount} out of {broadcastResult.totalTargets} contact(s).
                </p>
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  className="mt-2 w-full py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendBroadcast} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Audience Segment
                  </label>
                  <select
                    value={broadcastFilter}
                    onChange={(e) => setBroadcastFilter(e.target.value)}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">All Captured Leads ({leads.length} contacts)</option>
                    <option value="lead">New Leads Only</option>
                    <option value="interested">Interested Prospects Only</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Message Template (Supports <code className="text-emerald-400 font-mono">{"{name}"}</code> & <code className="text-emerald-400 font-mono">{"{business}"}</code>)
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={broadcastTemplate}
                    onChange={(e) => setBroadcastTemplate(e.target.value)}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed font-sans"
                    placeholder="Hello {name}! We have an exclusive update from {business}..."
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Preview: &quot;{broadcastTemplate.replace(/\{name\}/gi, "Chioma").replace(/\{business\}/gi, currentWs?.name || "Business")}&quot;
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={broadcastLoading}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {broadcastLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Dispatching to WhatsApp...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Broadcast Now</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD BUSINESS WORKSPACE */}
      {/* ============================================================== */}
      {showNewWsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" /> Register Business Workspace
              </h3>
              <button
                onClick={() => setShowNewWsModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {createWsError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
                {createWsError}
              </div>
            )}

            <form onSubmit={handleCreateWorkspace} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Havilah Touch Farms"
                  value={newWsForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "-")
                      .replace(/-+/g, "-");
                    setNewWsForm({ ...newWsForm, name, slug });
                  }}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Unique Handle / URL Slug
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. havilah-touch"
                  value={newWsForm.slug}
                  onChange={(e) =>
                    setNewWsForm({
                      ...newWsForm,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                    })
                  }
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Your hotline will be: /call?biz={newWsForm.slug || "slug"}
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Owner Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fadesewa Adeleke"
                  value={newWsForm.owner_name}
                  onChange={(e) =>
                    setNewWsForm({ ...newWsForm, owner_name: e.target.value })
                  }
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Owner WhatsApp Phone Number *
                </label>
                <div className="flex gap-2">
                  <select
                    value={modalCountryCode}
                    onChange={(e) => setModalCountryCode(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.label} value={c.code} className="bg-slate-900 text-white">
                        {c.flag} {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9074027451"
                    value={modalLocalPhone}
                    onChange={(e) => setModalLocalPhone(e.target.value.replace(/^0+/, "").replace(/[^0-9]/g, ""))}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">
                  Full WhatsApp format: +{modalCountryCode}{modalLocalPhone || "9074027451"}
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Owner Email (Optional)</label>
                <input
                  type="email"
                  placeholder="contact@business.com"
                  value={newWsForm.owner_email}
                  onChange={(e) =>
                    setNewWsForm({ ...newWsForm, owner_email: e.target.value })
                  }
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Selected Package</label>
                <select
                  value={newWsForm.plan}
                  onChange={(e) => setNewWsForm({ ...newWsForm, plan: e.target.value })}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="trial">🎉 7-Day Free Trial (Pro Features — ₦0 Today)</option>
                  <option value="starter">Starter Plan</option>
                  <option value="pro">Pro Business Plan</option>
                  <option value="enterprise">Enterprise Plan</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={createWsLoading}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {createWsLoading ? "Creating Business Workspace..." : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD KEYWORD RULE */}
      {/* ============================================================== */}
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" /> New Keyword Auto-Responder
              </h3>
              <button
                onClick={() => setShowNewRuleModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRule} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Trigger Keywords (Comma-separated)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. price, cost, how much, pricing"
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Action Type
                </label>
                <select
                  value={newRuleAction}
                  onChange={(e) => setNewRuleAction(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="reply_only">Direct Auto-Reply Only</option>
                  <option value="send_catalog">Send Catalog & Pricing</option>
                  <option value="collect_order">Collect Order / Payment Info</option>
                  <option value="notify_owner">Alert Business Owner on WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Instant Response Message
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Here is our current pricing and catalog details..."
                  value={newRuleResponse}
                  onChange={(e) => setNewRuleResponse(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={ruleSubmitting}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {ruleSubmitting ? "Saving Trigger..." : "Add Keyword Trigger"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile-First Bottom Navigation Bar (md:hidden) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#060d1a]/95 backdrop-blur-xl border-t border-slate-800/90 py-1 px-3 flex items-center justify-around md:hidden">
        {[
          { id: "overview", label: "Overview", icon: TrendingUp },
          { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, alert: waState !== "connected" },
          { id: "status", label: "Status", icon: Radio },
          { id: "brain", label: "Settings", icon: Sparkles },
          { id: "leads", label: "Leads", icon: Users, badge: leads.length },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition relative min-h-[44px] cursor-pointer ${
                isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                {item.alert && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function ControlRoomPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">Loading Control Room...</div>}>
      <ControlRoomContent />
    </Suspense>
  );
}
