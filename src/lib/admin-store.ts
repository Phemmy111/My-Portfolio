import fs from "fs";
import path from "path";

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  serviceNeeded: "Web Development" | "Automation / n8n" | "AI Integration" | "Video / Content" | "Other";
  status: "new" | "drafted" | "contacted" | "replied" | "converted" | "closed";
  niche: string;
  notes: string;
  draftSubject?: string;
  draftBody?: string;
  createdAt: string;
  lastContactedAt?: string | null;
}

export interface Proposal {
  id: string;
  platform: "Upwork" | "Fiverr" | "Direct Client" | "LinkedIn";
  jobTitle: string;
  jobDescription: string;
  angle: "High Authority Lead" | "Rapid Automation & Speed" | "ROI & Value Focus";
  generatedProposal: string;
  relevantProjects: string[];
  createdAt: string;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  service: string;
  message: string;
  status: "unread" | "read" | "replied";
  createdAt: string;
}

interface AdminData {
  leads: Lead[];
  proposals: Proposal[];
  inquiries: Inquiry[];
}

// Detect Vercel or read-only production environments
const isServerless = !!process.env.VERCEL || process.env.NODE_ENV === "production";
const DATA_DIR = isServerless ? path.join("/tmp", "femi-data") : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "admin-data.json");

// Clean store initialized with zero generic placeholders (all data sourced live from Neon DB)
const SEED_DATA: AdminData = {
  leads: [],
  proposals: [],
  inquiries: [],
};

// In-memory cache ensures zero crashes even if filesystem is read-only
let inMemoryStore: AdminData = JSON.parse(JSON.stringify(SEED_DATA));

function ensureDataFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(inMemoryStore, null, 2), "utf-8");
    }
  } catch (err) {
    // Graceful fallback to memory store in read-only environment
    console.warn("[AdminStore] Filesystem fallback to memory:", (err as Error)?.message);
  }
}

function readData(): AdminData {
  try {
    ensureDataFile();
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw) as AdminData;
      if (parsed && Array.isArray(parsed.leads)) {
        inMemoryStore = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[AdminStore] Read fallback to memory:", (err as Error)?.message);
  }
  return inMemoryStore;
}

function writeData(data: AdminData): void {
  inMemoryStore = data;
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("[AdminStore] Write fallback to memory:", (err as Error)?.message);
  }
}

// -----------------------------------------------------------------------
// LEADS CRUD
// -----------------------------------------------------------------------
export function getLeads(): Lead[] {
  return readData().leads.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addLead(lead: Omit<Lead, "id" | "createdAt">): Lead {
  const data = readData();
  const newLead: Lead = {
    ...lead,
    id: `lead-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  data.leads.unshift(newLead);
  writeData(data);
  return newLead;
}

export function updateLead(id: string, updates: Partial<Lead>): Lead | null {
  const data = readData();
  const index = data.leads.findIndex((l) => l.id === id);
  if (index === -1) return null;
  data.leads[index] = { ...data.leads[index], ...updates };
  writeData(data);
  return data.leads[index];
}

export function deleteLead(id: string): boolean {
  const data = readData();
  const initialLen = data.leads.length;
  data.leads = data.leads.filter((l) => l.id !== id);
  if (data.leads.length !== initialLen) {
    writeData(data);
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// PROPOSALS CRUD
// -----------------------------------------------------------------------
export function getProposals(): Proposal[] {
  return readData().proposals.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function saveProposal(prop: Omit<Proposal, "id" | "createdAt">): Proposal {
  const data = readData();
  const newProp: Proposal = {
    ...prop,
    id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  data.proposals.unshift(newProp);
  writeData(data);
  return newProp;
}

export function deleteProposal(id: string): boolean {
  const data = readData();
  const initialLen = data.proposals.length;
  data.proposals = data.proposals.filter((p) => p.id !== id);
  if (data.proposals.length !== initialLen) {
    writeData(data);
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// INQUIRIES CRUD
// -----------------------------------------------------------------------
export function getInquiries(): Inquiry[] {
  return readData().inquiries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addInquiry(inq: Omit<Inquiry, "id" | "status" | "createdAt">): Inquiry {
  const data = readData();
  const newInq: Inquiry = {
    ...inq,
    id: `inq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    status: "unread",
    createdAt: new Date().toISOString(),
  };
  data.inquiries.unshift(newInq);
  writeData(data);
  return newInq;
}

export function updateInquiryStatus(id: string, status: "unread" | "read" | "replied"): Inquiry | null {
  const data = readData();
  const index = data.inquiries.findIndex((i) => i.id === id);
  if (index === -1) return null;
  data.inquiries[index].status = status;
  writeData(data);
  return data.inquiries[index];
}

export function deleteInquiry(id: string): boolean {
  const data = readData();
  const initialLen = data.inquiries.length;
  data.inquiries = data.inquiries.filter((i) => i.id !== id);
  if (data.inquiries.length !== initialLen) {
    writeData(data);
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// STATS
// -----------------------------------------------------------------------
export function getAdminStats() {
  const data = readData();
  return {
    totalLeads: data.leads.length,
    activeLeads: data.leads.filter((l) => l.status !== "closed").length,
    convertedLeads: data.leads.filter((l) => l.status === "converted").length,
    totalProposals: data.proposals.length,
    totalInquiries: data.inquiries.length,
    unreadInquiries: data.inquiries.filter((i) => i.status === "unread").length,
  };
}

// Default passcode is femi2026 if not set in process.env.ADMIN_PASSCODE
export const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "femi2026";
