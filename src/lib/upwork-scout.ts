import { generateGigProposal } from "./gig-generator";
import { createAgentTask } from "./obey-agent";

export interface UpworkJob {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  budget?: string;
  category?: string;
}

/**
 * Fetches and parses live Upwork jobs via search RSS feed
 */
export async function fetchLiveUpworkJobs(query = "next.js OR n8n OR automation OR flutter OR ai"): Promise<UpworkJob[]> {
  const encodedQuery = encodeURIComponent(query);
  const rssUrl = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodedQuery}&sort=recency`;

  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      console.warn(`Upwork RSS returned HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return parseUpworkRss(xml);
  } catch (err) {
    console.error("Failed to fetch Upwork RSS:", err);
    return [];
  }
}

/**
 * Lightweight, safe XML parser for Upwork RSS items
 */
function parseUpworkRss(xml: string): UpworkJob[] {
  const jobs: UpworkJob[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i.exec(itemContent);
    const linkMatch = /<link>(.*?)<\/link>/i.exec(itemContent);
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i.exec(itemContent);
    const dateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemContent);

    const title = (titleMatch ? titleMatch[1] || titleMatch[2] : "").trim();
    const link = (linkMatch ? linkMatch[1] : "").trim();
    let rawDesc = (descMatch ? descMatch[1] || descMatch[2] : "").trim();

    // Clean up HTML tags from description
    const cleanDesc = rawDesc
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();

    // Extract budget or hourly rate if present
    const budgetMatch = /(?:Budget|Hourly Range):\s*([^\n<]+)/i.exec(cleanDesc);
    const budget = budgetMatch ? budgetMatch[1].trim() : "Hourly / Custom";

    if (title && link) {
      jobs.push({
        title,
        link,
        description: cleanDesc,
        pubDate: dateMatch ? dateMatch[1] : new Date().toISOString(),
        budget,
      });
    }

    if (jobs.length >= 10) break; // Limit to 10 latest jobs
  }

  return jobs;
}

/**
 * Scout live Upwork jobs, generate proposals, and queue them for Femi's approval
 */
export async function runUpworkLiveScout() {
  const liveJobs = await fetchLiveUpworkJobs();

  if (liveJobs.length === 0) {
    return {
      success: false,
      message: "No new Upwork jobs retrieved in this scan (or feed throttled).",
      tasks: [],
    };
  }

  const queuedTasks = [];

  for (const job of liveJobs.slice(0, 3)) { // Process top 3 newest jobs
    // Generate proposal
    const result = generateGigProposal({
      platform: "Upwork",
      jobTitle: job.title,
      jobDescription: job.description,
      angle: "Rapid Automation & Speed",
    });

    const fullPayload = `JOB LINK: ${job.link}\nBUDGET: ${job.budget}\n\n-- PROPOSED BID --\n${result.proposal}`;

    // Queue in Obey tasks
    const task = await createAgentTask({
      task_type: "upwork_proposal",
      title: `Upwork: ${job.title.slice(0, 60)}...`,
      target_name: "Upwork Client",
      target_company: `Upwork (${job.budget || 'Open Budget'})`,
      target_email: job.link,
      subject: `Proposal: ${job.title}`,
      payload: fullPayload,
    });

    queuedTasks.push(task);
  }

  return {
    success: true,
    message: `Obey scouted Upwork and generated ${queuedTasks.length} live job proposals awaiting your review!`,
    tasks: queuedTasks,
  };
}
