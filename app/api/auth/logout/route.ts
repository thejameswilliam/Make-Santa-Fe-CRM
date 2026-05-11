import { NextRequest } from "next/server";

import { clearSessionCookie, redirectFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = redirectFromRequest(request, "/login");
  clearSessionCookie(response);
  return response;
}
