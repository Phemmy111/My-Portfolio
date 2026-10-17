import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbGetWorkspaceLeads,
  dbGetContactBucketById,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

export const maxDuration = 60;

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
    const {
      template,
      targetType = "segment", // "segment" | "specific_numbers" | "bucket"
      statusFilter = "all",
      specificNumbers = [], // array of phone strings
      bucketId,
    } = body;

    if (!template || !template.trim()) {
      return NextResponse.json(
        { error: "Broadcast message template is required" },
        { status: 400 }
      );
    }

    const instanceName = ws.whatsapp_instance_name || (slug === "femi-adeleke" ? "obey" : `obey-${slug}`);
    const allLeads = await dbGetWorkspaceLeads(ws.id);
    const leadsMap = new Map<string, typeof allLeads[0]>();
    for (const lead of allLeads) {
      const clean = (lead.phone || "").replace(/\D/g, "");
      if (clean) leadsMap.set(clean, lead);
    }

    interface TargetRecipient {
      phone: string;
      name: string;
    }

    let targetRecipients: TargetRecipient[] = [];

    if (targetType === "specific_numbers") {
      if (!Array.isArray(specificNumbers) || specificNumbers.length === 0) {
        return NextResponse.json(
          { error: "Please select at least one phone number to broadcast to." },
          { status: 400 }
        );
      }
      for (const num of specificNumbers) {
        const clean = String(num).replace(/\D/g, "");
        if (clean.length >= 8) {
          const lead = leadsMap.get(clean);
          targetRecipients.push({
            phone: clean,
            name: lead?.name || `Friend`,
          });
        }
      }
    } else if (targetType === "bucket") {
      if (!bucketId) {
        return NextResponse.json({ error: "Bucket ID is required." }, { status: 400 });
      }
      const bucket = await dbGetContactBucketById(bucketId);
      if (!bucket) {
        return NextResponse.json({ error: "Contact Bucket not found." }, { status: 404 });
      }
      for (const num of bucket.contact_phones) {
        const clean = String(num).replace(/\D/g, "");
        if (clean.length >= 8) {
          const lead = leadsMap.get(clean);
          targetRecipients.push({
            phone: clean,
            name: lead?.name || `Friend`,
          });
        }
      }
    } else {
      // Segment filter
      const filteredLeads = allLeads.filter((lead) => {
        if (statusFilter === "all") return true;
        return lead.status === statusFilter;
      });

      targetRecipients = filteredLeads.map((lead) => ({
        phone: (lead.phone || "").replace(/\D/g, ""),
        name: lead.name || "Friend",
      }));
    }

    // Deduplicate by phone number
    const uniqueRecipients = Array.from(
      new Map(targetRecipients.map((item) => [item.phone, item])).values()
    );

    if (uniqueRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        dispatchedCount: 0,
        totalTargets: 0,
        message: "No recipients matched the selected audience.",
      });
    }

    let dispatchedCount = 0;
    const errors: string[] = [];

    for (const recipient of uniqueRecipients) {
      const personalizedMessage = template
        .replace(/\{name\}/gi, recipient.name)
        .replace(/\{business\}/gi, ws.name);

      try {
        const res = await sendWhatsAppMessage(
          personalizedMessage,
          recipient.phone,
          instanceName
        );
        if (res.success) {
          dispatchedCount++;
        } else {
          errors.push(`Failed for +${recipient.phone}: ${res.error || "Send error"}`);
        }
      } catch (err: any) {
        errors.push(`Error for +${recipient.phone}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalTargets: uniqueRecipients.length,
      dispatchedCount,
      errors: errors.slice(0, 5),
    });
  } catch (error: any) {
    console.error("[Broadcast API] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to dispatch broadcast" },
      { status: 500 }
    );
  }
}
