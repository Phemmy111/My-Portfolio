import { NextRequest } from "next/server";
import { POST as handleBillingWebhook } from "@/app/api/obey/billing/webhook/route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleBillingWebhook(req);
}
