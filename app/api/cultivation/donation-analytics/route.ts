import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { getDonationAnalytics } from "@/lib/crm";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  if (!startDateParam || !endDateParam) {
    return NextResponse.json({ error: "startDate and endDate are required." }, { status: 400 });
  }

  const startDate = new Date(`${startDateParam}T00:00:00.000Z`);
  const endDate = new Date(`${endDateParam}T23:59:59.999Z`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  try {
    const data = await getDonationAnalytics({ startDate, endDate });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Donation analytics failed", error);
    return NextResponse.json({ error: "Could not load donation analytics." }, { status: 500 });
  }
}
