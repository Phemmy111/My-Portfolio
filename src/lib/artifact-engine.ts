import { neon } from "@neondatabase/serverless";

export interface Artifact {
  id: string;
  identifier?: string;
  title: string;
  type: "html" | "react" | "svg" | "mermaid" | "markdown" | "code" | "document" | "n8n_workflow";
  content: string;
  description?: string;
  user_identifier?: string;
  created_at?: string;
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

let tableChecked = false;
async function ensureArtifactsTable() {
  if (tableChecked) return;
  try {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS obey_artifacts (
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        description TEXT,
        user_identifier TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    // Add columns if table already existed with older schema
    try {
      await sql`ALTER TABLE obey_artifacts ADD COLUMN IF NOT EXISTS identifier TEXT;`;
      await sql`ALTER TABLE obey_artifacts ADD COLUMN IF NOT EXISTS user_identifier TEXT;`;
    } catch {}
    tableChecked = true;
  } catch (err) {
    console.warn("[Artifacts] Could not ensure table:", err);
  }
}

export async function saveArtifact(data: {
  id?: string;
  identifier?: string;
  title: string;
  type: string;
  content: string;
  description?: string;
  user_identifier?: string;
}): Promise<Artifact> {
  await ensureArtifactsTable();
  const sql = getSql();

  // If this user already has an artifact with the same identifier, update that existing artifact!
  let targetId = data.id;
  if (!targetId && data.user_identifier && data.identifier) {
    const existing = await sql`
      SELECT id FROM obey_artifacts
      WHERE user_identifier = ${data.user_identifier} AND identifier = ${data.identifier}
      LIMIT 1;
    `;
    if (existing.length > 0) {
      targetId = existing[0].id;
    }
  }

  const id = targetId || `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const identifier = data.identifier || id;
  const title = data.title || "Interactive Artifact";
  const type = (data.type || "html").toLowerCase() as any;
  const content = data.content || "";
  const description = data.description || "";
  const userIdentifier = data.user_identifier || null;

  await sql`
    INSERT INTO obey_artifacts (id, identifier, title, type, content, description, user_identifier, created_at)
    VALUES (${id}, ${identifier}, ${title}, ${type}, ${content}, ${description}, ${userIdentifier}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      identifier = EXCLUDED.identifier,
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      content = EXCLUDED.content,
      description = EXCLUDED.description,
      user_identifier = COALESCE(EXCLUDED.user_identifier, obey_artifacts.user_identifier);
  `;

  return { id, identifier, title, type, content, description, user_identifier: userIdentifier || undefined };
}

export async function getArtifact(id: string): Promise<Artifact | null> {
  await ensureArtifactsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT id, identifier, title, type, content, description, user_identifier, created_at
    FROM obey_artifacts
    WHERE id = ${id}
    LIMIT 1;
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    identifier: r.identifier,
    title: r.title,
    type: r.type,
    content: r.content,
    description: r.description,
    user_identifier: r.user_identifier,
    created_at: r.created_at,
  };
}

/**
 * Retrieves the most recent artifact generated for a specific user/channel.
 */
export async function getLatestUserArtifact(userIdentifier: string): Promise<Artifact | null> {
  try {
    await ensureArtifactsTable();
    const sql = getSql();
    const rows = await sql`
      SELECT id, identifier, title, type, content, description, user_identifier, created_at
      FROM obey_artifacts
      WHERE user_identifier = ${userIdentifier}
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      identifier: r.identifier,
      title: r.title,
      type: r.type,
      content: r.content,
      description: r.description,
      user_identifier: r.user_identifier,
      created_at: r.created_at,
    };
  } catch (err) {
    console.warn("[Artifacts] Error getting latest user artifact:", err);
    return null;
  }
}

/**
 * Retrieves the user's recent artifacts (history of generated web pages / code).
 */
export async function getUserArtifacts(userIdentifier: string, limit = 5): Promise<Artifact[]> {
  try {
    await ensureArtifactsTable();
    const sql = getSql();
    const rows = await sql`
      SELECT id, identifier, title, type, content, description, user_identifier, created_at
      FROM obey_artifacts
      WHERE user_identifier = ${userIdentifier}
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;
    return rows.map((r: any) => ({
      id: r.id,
      identifier: r.identifier,
      title: r.title,
      type: r.type,
      content: r.content,
      description: r.description,
      user_identifier: r.user_identifier,
      created_at: r.created_at,
    }));
  } catch (err) {
    console.warn("[Artifacts] Error getting user artifacts:", err);
    return [];
  }
}

/**
 * Finds a specific user artifact by keywords or falls back to latest.
 */
export async function findUserArtifact(userIdentifier: string, query?: string): Promise<Artifact | null> {
  try {
    await ensureArtifactsTable();
    const sql = getSql();
    if (query && query.trim().length > 2) {
      const cleanQ = `%${query.trim().toLowerCase()}%`;
      const rows = await sql`
        SELECT id, identifier, title, type, content, description, user_identifier, created_at
        FROM obey_artifacts
        WHERE user_identifier = ${userIdentifier}
          AND (LOWER(title) LIKE ${cleanQ} OR LOWER(description) LIKE ${cleanQ})
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      if (rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          identifier: r.identifier,
          title: r.title,
          type: r.type,
          content: r.content,
          description: r.description,
          user_identifier: r.user_identifier,
          created_at: r.created_at,
        };
      }
    }
    return getLatestUserArtifact(userIdentifier);
  } catch (err) {
    return getLatestUserArtifact(userIdentifier);
  }
}

/**
 * Extracts artifact blocks from AI model responses formatted as:
 * <artifact identifier="..." type="..." title="...">content</artifact>
 * Supports ANY attribute order and auto-heals unclosed tags.
 */
export function extractArtifactBlocks(text: string): Array<{
  identifier: string;
  type: string;
  title: string;
  content: string;
}> {
  const artifacts: Array<{ identifier: string; type: string; title: string; content: string }> = [];
  const regex = /<artifact\b([^>]*)>([\s\S]*?)(?:<\/artifact>|$)/gi;
  
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const attrString = match[1] || "";
    const content = match[2]?.trim() || "";
    if (!content) continue;

    const idMatch = attrString.match(/identifier=["']([^"']+)["']/i);
    const typeMatch = attrString.match(/type=["']([^"']+)["']/i);
    const titleMatch = attrString.match(/title=["']([^"']+)["']/i);

    const identifier = idMatch ? idMatch[1] : `art-${Date.now()}`;
    const type = typeMatch ? typeMatch[1] : "html";
    const title = titleMatch ? titleMatch[1] : "Interactive Artifact";

    artifacts.push({
      identifier,
      type,
      title,
      content,
    });
  }

  return artifacts;
}

/**
 * Strips raw artifact blocks from the chat reply so users are never spammed
 * with hundreds of lines of raw HTML/code in their messaging bubbles.
 * Handles any attribute order and unclosed tags.
 */
export function stripArtifactBlocks(text: string): string {
  if (!text) return "";
  return text
    .replace(/<artifact\b[^>]*>[\s\S]*?(?:<\/artifact>|$)/gi, "")
    .trim();
}
