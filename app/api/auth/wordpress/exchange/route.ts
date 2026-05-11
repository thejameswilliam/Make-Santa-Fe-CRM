import { NextRequest, NextResponse } from "next/server";

import { config } from "@/lib/config";
import { setSessionCookie } from "@/lib/auth";
import { exchangeWordPressCredentials } from "@/lib/wordpress";

function redirectTo(request: NextRequest, target: string) {
  return NextResponse.redirect(new URL(target, request.url));
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const applicationPassword = String(formData.get("applicationPassword") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/");

  try {
    const user =
      config.allowDevLogin && username === "demo" && applicationPassword === "demo"
        ? {
            id: "dev-demo",
            name: "Development Demo User",
            email: "demo@example.org"
          }
        : await exchangeWordPressCredentials(username, applicationPassword);

    const response = redirectTo(request, returnTo);
    setSessionCookie(response, user);
    return response;
  } catch {
    return redirectTo(request, "/login");
  }
}
