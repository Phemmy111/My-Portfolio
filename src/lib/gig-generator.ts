// ============================================================
// FEMI ADELEKE — INTELLIGENT GIG & COLD OUTREACH GENERATOR
// Battle-tested proposal engineering tailored to Femi's stack
// ============================================================

export interface ColdEmailDraft {
  subject: string;
  body: string;
  followUp: string;
}

export interface GigProposalResult {
  proposal: string;
  detectedKeywords: string[];
  recommendedProjects: string[];
  estimatedTurnaround: string;
}

/**
 * Generates an executive cold outreach email tailored to a prospective lead.
 */
export function generateColdEmail(params: {
  leadName: string;
  companyName: string;
  niche: string;
  serviceNeeded: string;
  specificPainPoint?: string;
}): ColdEmailDraft {
  const { leadName, companyName, niche, serviceNeeded, specificPainPoint } = params;
  const firstName = leadName.split(" ")[0] || leadName;

  let subject = `Quick question regarding ${companyName}'s ${niche.toLowerCase()} workflow`;
  let valueAngle = "";
  let proof = "";

  if (serviceNeeded.includes("Automation") || serviceNeeded.includes("n8n")) {
    subject = `Automating ${companyName}'s manual operations & WhatsApp workflows`;
    valueAngle = `I help fast-growing operations eliminate repetitive manual data entry, automate lead onboarding, and wire together seamless CRM/webhook pipelines using n8n and AI agents.`;
    proof = `Recently, I engineered automated pipelines that handle lead notifications, payment webhooks, and customer messaging without human intervention — saving dozens of hours every week.`;
  } else if (serviceNeeded.includes("Web") || serviceNeeded.includes("Development")) {
    subject = `Enhancing ${companyName}'s digital web experience & conversions`;
    valueAngle = `I build blazing-fast full-stack web applications with Next.js, React, and modern databases that look world-class and load instantly on mobile.`;
    proof = `I recently built full platforms including OKIKI Store (a modern e-commerce web platform) and educational tech ecosystems, designed for high contrast, clean architecture, and instant speed.`;
  } else if (serviceNeeded.includes("AI")) {
    subject = `Embedding AI agents & automated logic into ${companyName}`;
    valueAngle = `I help companies embed intelligent LLM agents, smart automated customer assistants, and RAG systems directly into their customer-facing products.`;
    proof = `As the founder of AutoLearn Spot, I instruct and architect production-grade AI systems, automated workflow pipelines, and intelligent tools.`;
  } else if (serviceNeeded.includes("Video") || serviceNeeded.includes("Content")) {
    subject = `High-impact video direction & AI creative content for ${companyName}`;
    valueAngle = `I direct and produce high-retention video commercials, viral social edits, and AI-assisted visual narratives that drive engagement.`;
    proof = `From directing AI video pipelines (Google Flow, CapCut) to commercial production and original audio composition, I deliver complete end-to-end media assets.`;
  } else {
    valueAngle = `I architect scalable web platforms, automated business pipelines with n8n, and digital platforms that generate measurable ROI.`;
    proof = `Founder of AutoLearn Spot and developer behind multiple high-performance web products including OKIKI Store.`;
  }

  const painPointSentence = specificPainPoint
    ? `Specifically, I noticed you might be navigating ${specificPainPoint}, which is an area where a modern, automated system can make an immediate impact.`
    : `Given your focus in the ${niche} space, having an automated and frictionless digital infrastructure is essential for scaling smoothly.`;

  const body = `Hi ${firstName},

${painPointSentence}

${valueAngle}

${proof}

I’d love to share 2–3 specific ideas on how we can optimize your operations or web architecture — no obligation at all.

Would you be open to a quick 10-minute chat later this week?

Best regards,
Femi Adeleke
Full-Stack Developer & Automation Engineer
Founder, AutoLearn Spot
https://github.com/Phemmy111`;

  const followUp = `Hi ${firstName},

Following up quickly on my note from last week regarding ${companyName}'s ${niche.toLowerCase()} infrastructure.

If this is on your roadmap for this quarter, I’m happy to put together a brief visual outline of how we can execute it cleanly.

Let me know if you have 5 minutes to connect!

Warm regards,
Femi Adeleke`;

  return { subject, body, followUp };
}

/**
 * Generates high-converting Upwork / Fiverr proposals by analyzing the client's job post.
 */
export function generateGigProposal(params: {
  platform: "Upwork" | "Fiverr" | "Direct Client" | "LinkedIn";
  jobTitle: string;
  jobDescription: string;
  angle: "High Authority Lead" | "Rapid Automation & Speed" | "ROI & Value Focus";
}): GigProposalResult {
  const { platform, jobTitle, jobDescription, angle } = params;
  const descLower = `${jobTitle} ${jobDescription}`.toLowerCase();

  // Detect relevant technical domains
  const detectedKeywords: string[] = [];
  const recommendedProjects: string[] = [];

  const isAutomation = /n8n|zapier|make\.com|automation|webhook|workflow|bot|whatsapp|telegram/i.test(descLower);
  const isWeb = /next\.?js|react|full-stack|frontend|typescript|tailwind|node|postgres|neon/i.test(descLower);
  const isEcom = /ecommerce|e-commerce|store|shop|shopify|paystack|stripe|cart/i.test(descLower);
  const isMobile = /flutter|mobile|android|ios|app/i.test(descLower);
  const isAI = /ai|gpt|llm|agent|rag|openai|prompt|anthropic/i.test(descLower);
  const isVideo = /video|edit|reel|cinematic|capcut|audio|music|fl studio/i.test(descLower);

  if (isAutomation) {
    detectedKeywords.push("n8n Pipelines", "Webhooks & APIs", "Workflow Automation");
    recommendedProjects.push("n8n Business Automation Workflows", "AutoLearn Spot Automation Lab");
  }
  if (isWeb) {
    detectedKeywords.push("Next.js 16", "React", "TypeScript", "Neon DB");
    recommendedProjects.push("OKIKI Store (Next.js)", "AutoLearn Spot Portal");
  }
  if (isEcom) {
    detectedKeywords.push("E-Commerce Architecture", "Payment Gateway (Paystack/Stripe)", "Cart Flow");
    recommendedProjects.push("OKIKI Electronics Store", "Jeweller's Hub");
  }
  if (isMobile) {
    detectedKeywords.push("Flutter", "Mobile Architecture", "Cross-Platform");
    recommendedProjects.push("PassMark UTME Prep App", "UniVibe Mobile");
  }
  if (isAI) {
    detectedKeywords.push("AI Agent Integration", "LLM Workflows", "Prompt Engineering");
    recommendedProjects.push("AutoLearn Spot AI Platform");
  }
  if (isVideo) {
    detectedKeywords.push("AI Video Pipeline", "Video Editing", "Commercial Direction");
    recommendedProjects.push("Femi Adeleke Production Reel");
  }

  if (detectedKeywords.length === 0) {
    detectedKeywords.push("Full-Stack Architecture", "System Design", "Workflow Engineering");
    recommendedProjects.push("AutoLearn Spot", "OKIKI Store");
  }

  // Construct tailored proposal opening hook
  let hook = "";
  if (angle === "High Authority Lead") {
    hook = `Your requirement for "${jobTitle}" directly aligns with systems I design and deploy daily. I specialize in architecting clean, maintainable systems that scale without breaking.`;
  } else if (angle === "Rapid Automation & Speed") {
    hook = `I can execute "${jobTitle}" rapidly and cleanly. Having built similar ${detectedKeywords[0]} workflows recently, I can hit the ground running without an onboarding curve.`;
  } else {
    hook = `Looking over your project, the goal is clear: deliver a dependable, high-performance solution for "${jobTitle}" that delivers immediate ROI.`;
  }

  // Solution breakdown tailored to detected stack
  let solutionSteps = "";
  if (isAutomation) {
    solutionSteps = `Here is how I will approach this:
1. Architecture Mapping: Review your trigger sources and design idempotent workflow logic in n8n.
2. Webhook & Payload Sanitization: Ensure fail-safe data transmission with error handling and retry mechanisms.
3. Integration & Live Verification: Connect target endpoints and test end-to-end in production.
4. Documentation & Handover: Deliver a clear diagram and runbook so you maintain full control.`;
  } else if (isEcom || isWeb) {
    solutionSteps = `My recommended implementation roadmap:
1. Technical Foundation: Clean component structure built with Next.js, TypeScript, and modern styling.
2. State & Database Layer: Fast queries, resilient database transactions, and reactive UI states.
3. Performance & Mobile Responsiveness: 95+ Google Lighthouse score with instant mobile rendering.
4. Rigorous QA & Deployment: Vercel/production deployment with zero runtime errors.`;
  } else {
    solutionSteps = `My step-by-step roadmap:
1. Requirements & Scope Alignment: Clarify edge cases and technical constraints upfront.
2. Prototype & Core Implementation: Build the core engine and verify outputs with real test data.
3. Polish & Optimization: Refine user experience, performance, and reliability.
4. Seamless Handover: Provide live demo, walkthrough, and support during rollout.`;
  }

  // Portfolio proof text
  const proofText = `Relevant Proof of Work:
${recommendedProjects.map((p) => `• ${p}`).join("\n")}
You can inspect my code and engineering standard on GitHub: https://github.com/Phemmy111`;

  // Call to action
  const cta = platform === "Upwork"
    ? `I am available to start immediately and can jump on a brief 10-minute Upwork call today to align on specifications. Looking forward to your response!\n\nBest regards,\nFemi Adeleke`
    : platform === "Fiverr"
    ? `Feel free to send a message so we can review your exact files or specs, and I’ll send a custom offer tailored to your budget and deadline.\n\nBest,\nFemi Adeleke`
    : `Let’s set up a quick 10-minute discovery call to finalize scope and get this moving.\n\nWarm regards,\nFemi Adeleke`;

  const proposal = `${hook}

${solutionSteps}

${proofText}

${cta}`;

  const estimatedTurnaround = isAutomation ? "2–4 Days" : isWeb ? "4–7 Days" : "3–5 Days";

  return {
    proposal,
    detectedKeywords,
    recommendedProjects,
    estimatedTurnaround,
  };
}
