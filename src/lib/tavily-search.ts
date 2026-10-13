import { getSetting } from "./settings";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  success: boolean;
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  error?: string;
}

/**
 * Searches the live web using Tavily AI Search API
 */
export async function searchTavily(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
    apiKeyOverride?: string;
  }
): Promise<TavilySearchResponse> {
  const apiKey = options?.apiKeyOverride?.trim() || (await getSetting("TAVILY_API_KEY"))?.trim();

  if (!apiKey) {
    return {
      success: false,
      query,
      results: [],
      error: "Tavily API key is not configured. Add your TAVILY_API_KEY in Settings modal or .env.local.",
    };
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options?.searchDepth || "basic",
        include_answer: options?.includeAnswer ?? true,
        max_results: options?.maxResults || 5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        query,
        results: [],
        error: `Tavily HTTP ${res.status}: ${errText.slice(0, 120)}`,
      };
    }

    const data = await res.json();
    const results: TavilySearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title || "Web Result",
      url: r.url || "",
      content: r.content || "",
      score: r.score,
    }));

    return {
      success: true,
      query,
      answer: data.answer,
      results,
    };
  } catch (err: any) {
    console.error("Tavily search error:", err);
    return {
      success: false,
      query,
      results: [],
      error: err.message || "Network exception querying Tavily",
    };
  }
}
