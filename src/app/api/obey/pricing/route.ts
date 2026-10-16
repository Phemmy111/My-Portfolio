import { NextResponse } from "next/server";
import { dbGetPlatformPricing } from "@/lib/db";

export async function GET() {
  try {
    const pricing = await dbGetPlatformPricing();
    return NextResponse.json({ success: true, pricing });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
