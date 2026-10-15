import { neon } from "@neondatabase/serverless";

export interface Artifact {
  id: string;
  title: string;
  type: "html" | "react" | "svg" | "mermaid" | "markdown" | "code";
  content: string;
  description?: string;
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
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    tableChecked = true;
  } catch (err) {
    console.warn("[Artifacts] Could not ensure table:", err);
  }
}

export async function saveArtifact(data: {
  id?: string;
  title: string;
  type: string;
  content: string;
  description?: string;
}): Promise<Artifact> {
  await ensureArtifactsTable();
  const sql = getSql();
  const id = data.id || `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = data.title || "Interactive Artifact";
  const type = (data.type || "html").toLowerCase() as any;
  const content = data.content || "";
  const description = data.description || "";

  await sql`
    INSERT INTO obey_artifacts (id, title, type, content, description, created_at)
    VALUES (${id}, ${title}, ${type}, ${content}, ${description}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      content = EXCLUDED.content,
      description = EXCLUDED.description;
  `;

  return { id, title, type, content, description };
}

export async function getArtifact(id: string): Promise<Artifact | null> {
  await ensureArtifactsTable();
  const sql = getSql();
  const rows = await sql`
    SELECT id, title, type, content, description, created_at
    FROM obey_artifacts
    WHERE id = ${id}
    LIMIT 1;
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    content: r.content,
    description: r.description,
    created_at: r.created_at,
  };
}

/**
 * Extracts artifact blocks from AI model responses formatted as:
 * <artifact identifier="..." type="..." title="...">content</artifact>
 */
export function extractArtifactBlocks(text: string): Array<{
  identifier: string;
  type: string;
  title: string;
  content: string;
}> {
  const artifacts: Array<{ identifier: string; type: string; title: string; content: string }> = [];
  const regex = /<artifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/artifact>/gi;
  
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    artifacts.push({
      identifier: match[1],
      type: match[2],
      title: match[3],
      content: match[4].trim(),
    });
  }

  return artifacts;
}
