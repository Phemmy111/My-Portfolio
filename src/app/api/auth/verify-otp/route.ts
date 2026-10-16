import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { setAuthSession } from "@/lib/auth-session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { identifier, code } = body;

    if (!identifier || !code) {
      return NextResponse.json(
        { error: "Identifier and 6-digit verification code are required." },
        { status: 400 }
      );
    }

    const cleanCode = code.trim();
    let cleanIdentifier = identifier.trim();
    if (cleanIdentifier.startsWith("0")) {
      cleanIdentifier = "234" + cleanIdentifier.slice(1);
    }

    if (!sql) {
      return NextResponse.json(
        { error: "Database connection not available" },
        { status: 500 }
      );
    }

    // Check if code matches an active, unexpired, unused record
    const records = await sql`
      SELECT * FROM auth_otps
      WHERE (identifier = ${cleanIdentifier} OR phone = ${cleanIdentifier} OR email = ${cleanIdentifier.toLowerCase()})
        AND code = ${cleanCode}
        AND used = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please request a new code." },
        { status: 400 }
      );
    }

    const matchedRecord = records[0];

    // Mark code as used immediately
    await sql`
      UPDATE auth_otps
      SET used = TRUE
      WHERE id = ${matchedRecord.id}
    `;

    // Look up associated workspace in Neon DB
    let workspaceSlug = "femi-adeleke";
    let ownerName = "Business Owner";
    let plan = "starter";

    const cleanDigits = cleanIdentifier.replace(/\D/g, "");

    const workspaces = await sql`
      SELECT * FROM workspaces
      WHERE (owner_phone IS NOT NULL AND REGEXP_REPLACE(owner_phone, '\\D', '', 'g') = ${cleanDigits})
         OR (owner_email IS NOT NULL AND LOWER(owner_email) = ${cleanIdentifier.toLowerCase()})
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (workspaces && workspaces.length > 0) {
      const ws = workspaces[0];
      workspaceSlug = ws.slug;
      ownerName = ws.owner_name || ws.name;
      plan = ws.plan || "starter";
    } else if (cleanIdentifier.includes("femi") || cleanIdentifier.includes("8120934828")) {
      workspaceSlug = "femi-adeleke";
      ownerName = "Femi Adeleke";
      plan = "founder";
    }

    // Set signed HTTP-only auth session cookie
    await setAuthSession({
      phone: matchedRecord.phone || (cleanIdentifier.includes("@") ? undefined : cleanIdentifier),
      email: matchedRecord.email || (cleanIdentifier.includes("@") ? cleanIdentifier : undefined),
      workspaceSlug,
      ownerName,
      plan,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
      user: {
        phone: matchedRecord.phone,
        email: matchedRecord.email,
        workspaceSlug,
        ownerName,
        plan,
      },
    });
  } catch (err: any) {
    console.error("[OTP] verify-otp error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to verify passcode" },
      { status: 500 }
    );
  }
}
