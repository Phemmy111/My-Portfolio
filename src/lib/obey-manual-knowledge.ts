/**
 * Obey Central Knowledge Base: Platform Manual, Business Plans, and Flagship Relations
 * Shared across Main Obey (dynamic-companion) and Obey Business (multi-tenant webhooks).
 */

export interface PlatformPricingContext {
  starter_price?: number;
  pro_price?: number;
  enterprise_price?: number;
  trial_days?: number;
}

export function getObeyBusinessManualKnowledge(pricing?: PlatformPricingContext, baseUrl?: string): string {
  const starter = (pricing?.starter_price || 9500).toLocaleString();
  const pro = (pricing?.pro_price || 22500).toLocaleString();
  const enterprise = (pricing?.enterprise_price || 55000).toLocaleString();
  const trialDays = pricing?.trial_days || 7;
  const domain = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";

  return `
OBEY BUSINESS PLATFORM MANUAL & ARCHITECTURE:
Obey Business (${domain}/control-room) is an autonomous 24/7 AI operations and WhatsApp sales platform engineered for founders, business owners, and creators.

1. DYNAMIC COMMERCIAL SUBSCRIPTION TIERS:
• Starter Plan (₦${starter}/month): 1 business workspace, 250 auto-saved leads, 10 keyword auto-responders, 15 hrs/month WebRTC voice calls, 2 contact buckets, 1-tap VCF / CSV contact export.
• Pro Business Plan (₦${pro}/month) [Most Popular]: ${trialDays}-Day 100% Free Trial, UNLIMITED auto-saved customer leads, 50 keyword auto-responders, 50 hrs/month WebRTC voice calls, WhatsApp audio recordings & executive transcripts, custom business catalog with direct bank payment details, personalized WhatsApp broadcast engine, and up to 10 contact buckets.
• Enterprise / Founder Plan (₦${enterprise}/month): Multi-business management (up to 2 distinct workspaces), full multi-tenant WhatsApp bot, UNLIMITED voice hotline minutes, UNLIMITED contact buckets, autonomous n8n workflows & web app generator, and dedicated 24/7 priority engineer support.

2. CORE HOW-TO MANUAL & FEATURES:
• WhatsApp Connect (Plan A & Plan B):
  - Plan A: Scan QR code via WhatsApp Linked Devices (best for desktop/laptop).
  - Plan B (Pairing Code): Enter phone number in Control Room, receive an 8-digit code, and verify in WhatsApp notification (best for mobile).
• Contacts Management & WhatsApp Status View Booster:
  - WhatsApp Status View Rule: WhatsApp only displays status updates if BOTH the business and customer have each other's phone numbers saved in their address books.
  - Obey auto-captures every incoming lead into "Contacts & Auto-Saver".
  - 1-Click "Save All Unsaved": Generates a standard mobile .VCF file. Tapping this file on iOS or Android imports hundreds of unsaved contacts into the phone in 3 seconds, immediately boosting status views.
• Contact Buckets:
  - Custom audience segmentation (e.g. "Wholesale Buyers", "VIP", "Follow-ups") for targeted broadcasts and voice note dispatches.
• WhatsApp Broadcast Engine:
  - Personalized bulk message dispatch with dynamic tags like {name}.
• Autonomous WhatsApp Status Automator:
  - 24/7 status engine publishing directly to status@broadcast.
  - Video trimmer supporting up to 1:30s (WhatsApp standard).
  - AI status story composer & automated friendly quote comments on contacts' status updates.
• WebRTC Voice Hotline & Embed:
  - 100% free browser voice calling (no airtime fees) using secure WebRTC.
  - Embeddable HTML iframe snippet for websites and landing pages.
  - Global hotline number (+1 302 927 8209).
• n8n Workflow & Web Artifacts:
  - Generates ready-to-import production n8n JSON automation pipelines and interactive HTML/Tailwind web apps.
`;
}

export function getMainObeyFlagshipKnowledge(baseUrl?: string): string {
  const domain = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";

  return `
MAIN OBEY FLAGSHIP INTELLIGENCE:
• Main Obey is the flagship personal AI executive companion and senior software architect engineered by Femi Adeleke.
• Role: Acts as the client's dedicated personal AI Agent, companion, confidant, and assistant. Solves daily tasks, builds n8n workflows, codes software, analyzes media/docs, and leads technical strategy.
• Creator Distinction: He only mentions Femi Adeleke as his creator when it is needed to show off or brag ("I was engineered by Femi Adeleke, one of Nigeria's top AI architects..."). Otherwise, he is 100% focused on being the client's loyal, personal assistant.
• Creator Direct Contact & Chat Link:
  - Femi Adeleke (Founder & Lead Architect)
  - Direct WhatsApp Chat Link: https://wa.me/2348120934828 (+2348120934828)
  - Platform / Portfolio: ${domain}
  - CRITICAL: Whenever sharing Femi Adeleke or Main Obey's contact details, ALWAYS provide the direct clickable WhatsApp link: https://wa.me/2348120934828
`;
}

// Default static fallback exports for convenience
export const OBEY_BUSINESS_MANUAL_KNOWLEDGE = getObeyBusinessManualKnowledge();
export const MAIN_OBEY_FLAGSHIP_KNOWLEDGE = getMainObeyFlagshipKnowledge();
