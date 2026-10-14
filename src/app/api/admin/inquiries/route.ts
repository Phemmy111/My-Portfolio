import { NextRequest, NextResponse } from "next/server";
import { getInquiries, updateInquiryStatus, deleteInquiry } from "@/lib/admin-store";
import { dbGetInquiries, dbUpdateInquiryStatus, dbDeleteInquiry } from "@/lib/db";

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dbRows = await dbGetInquiries();
    const inquiries = (dbRows || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      service: row.service,
      message: row.message,
      status: row.status || "unread",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    }));
    return NextResponse.json({ inquiries });
  } catch (err) {
    console.warn("[Admin Inquiries] Falling back to admin-store:", err);
    const inquiries = getInquiries();
    return NextResponse.json({ inquiries });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ error: "ID and status required" }, { status: 400 });
    }

    try {
      const updated = await dbUpdateInquiryStatus(id, status);
      return NextResponse.json({ inquiry: updated });
    } catch {
      const updated = updateInquiryStatus(id, status);
      return NextResponse.json({ inquiry: updated });
    }
  } catch {
    return NextResponse.json({ error: "Failed to update inquiry" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Inquiry ID required" }, { status: 400 });
  }

  try {
    await dbDeleteInquiry(id);
    deleteInquiry(id);
    return NextResponse.json({ success: true });
  } catch {
    const deleted = deleteInquiry(id);
    return NextResponse.json({ success: deleted });
  }
}
