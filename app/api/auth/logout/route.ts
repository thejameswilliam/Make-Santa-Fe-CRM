import { NextRequest } from "next/server";

import { clearSessionCookie, redirectFromRequest } from "@/lib/auth";

function buildLogoutResponse(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo")?.trim() || "/login?force=1";
  const response = redirectFromRequest(request, returnTo);
  clearSessionCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  return buildLogoutResponse(request);
}

export async function POST(request: NextRequest) {
  return buildLogoutResponse(request);
}
