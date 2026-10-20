import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Proxy endpoint for Control Room Website Live Chat Simulator.
 * Fetches the user's website HTML, strips X-Frame-Options / CSP restrictions,
 * injects <base href> so relative assets load, and renders the live site seamlessly
 * inside the Control Room iframe without "refused to connect" browser blocks!
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return new NextResponse(
      renderFallbackHtml("No URL Provided", "Please enter a valid website URL in the Control Room."),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const parsed = new URL(targetUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return new NextResponse(
        renderFallbackHtml(
          "Direct Asset Detected",
          `The target URL (${targetUrl}) returned ${contentType} instead of HTML web page.`,
          targetUrl
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    let html = await res.text();

    // 1. Remove meta CSP and meta X-Frame-Options tags
    html = html.replace(/<meta[^>]*http-equiv=["']?(?:Content-Security-Policy|X-Frame-Options)["']?[^>]*>/gi, "");

    // 2. Anti-Frame-Busting and Base Href injection
    const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname.substring(0, parsed.pathname.lastIndexOf("/") + 1) || "/"}`;
    const injection = `
      <base href="${baseUrl}">
      <script>
        try {
          // Disable frame busting scripts
          Object.defineProperty(window, 'top', { get: function() { return window.self; } });
          Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
        } catch(e) {}
      </script>
    `;

    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${injection}`);
    } else if (html.includes("<HEAD>")) {
      html = html.replace("<HEAD>", `<HEAD>${injection}`);
    } else {
      html = `${injection}${html}`;
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err: any) {
    console.warn("[Website Preview Proxy] Failed to fetch target URL:", targetUrl, err?.message);
    return new NextResponse(
      renderFallbackHtml(
        "Website Preview Protected",
        `We could not directly mirror <strong>${targetUrl}</strong> in an iframe because the remote server timed out or has strict Cloudflare bot protection.`,
        targetUrl
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "ALLOWALL",
        },
      }
    );
  }
}

function renderFallbackHtml(title: string, message: string, targetUrl?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 32px 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 32px;
      max-width: 480px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      margin-bottom: 16px;
    }
    h2 { margin: 0 0 10px; font-size: 18px; color: #ffffff; }
    p { margin: 0 0 20px; font-size: 13px; line-height: 1.6; color: #94a3b8; }
    .btn {
      display: inline-block;
      background: #10b981;
      color: #042f2e;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 12px;
      transition: all 0.2s ease;
    }
    .btn:hover { background: #34d399; }
    .note {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #1e293b;
      font-size: 11px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌐</div>
    <h2>${title}</h2>
    <p>${message}</p>
    ${targetUrl ? `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="btn">Open ${new URL(targetUrl).hostname} in New Tab ↗</a>` : ""}
    <div class="note">
      💡 To have Obey float on your live website, simply paste your embed script before the closing <code>&lt;/body&gt;</code> tag.
    </div>
  </div>
</body>
</html>`;
}
