import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbGetContactBuckets,
  dbCreateContactBucket,
  dbUpdateContactBucket,
  dbDeleteContactBucket,
  getPlanBucketLimit,
} from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const buckets = await dbGetContactBuckets(ws.id);
    const limit = getPlanBucketLimit(ws.plan);

    return NextResponse.json({
      success: true,
      buckets,
      count: buckets.length,
      limit,
    });
  } catch (err: any) {
    console.error("[Buckets API] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, phones = [], description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Bucket name is required." }, { status: 400 });
    }

    const existingBuckets = await dbGetContactBuckets(ws.id);
    const limit = getPlanBucketLimit(ws.plan);

    if (existingBuckets.length >= limit) {
      return NextResponse.json(
        {
          error: `You have reached your plan limit of ${limit} contact bucket${
            limit > 1 ? "s" : ""
          }. Upgrade your plan to create more buckets.`,
        },
        { status: 400 }
      );
    }

    const bucket = await dbCreateContactBucket({
      workspaceId: ws.id,
      name: name.trim(),
      phones,
      description,
    });

    if (!bucket) {
      return NextResponse.json({ error: "Failed to create contact bucket." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bucket,
      message: `Bucket "${bucket.name}" created with ${bucket.contact_phones.length} contact(s)!`,
    });
  } catch (err: any) {
    console.error("[Buckets API] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const { bucketId, name, description, phones } = body;

    if (!bucketId) {
      return NextResponse.json({ error: "Bucket ID is required." }, { status: 400 });
    }

    const updated = await dbUpdateContactBucket({
      bucketId,
      workspaceId: ws.id,
      name,
      description,
      phones,
    });

    if (!updated) {
      return NextResponse.json({ error: "Failed to update bucket." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bucket: updated,
      message: `Bucket "${updated.name}" updated successfully.`,
    });
  } catch (err: any) {
    console.error("[Buckets API] PUT error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("id");

    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (!bucketId) {
      return NextResponse.json({ error: "Bucket ID is required." }, { status: 400 });
    }

    const ok = await dbDeleteContactBucket(bucketId, ws.id);
    return NextResponse.json({
      success: ok,
      message: ok ? "Bucket deleted successfully." : "Failed to delete bucket.",
    });
  } catch (err: any) {
    console.error("[Buckets API] DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
