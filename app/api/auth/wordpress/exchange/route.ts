import { NextRequest } from "next/server";

import { config } from "@/lib/config";
import { redirectFromRequest, setSessionCookie } from "@/lib/auth";
import { exchangeWordPressCredentials } from "@/lib/wordpress";

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

    const response = redirectFromRequest(request, returnTo);
    setSessionCookie(response, user);
    return response;
  } catch {
    return redirectFromRequest(request, "/login");
  }
}
