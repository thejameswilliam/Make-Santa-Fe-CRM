import { NextRequest } from "next/server";

import { buildRequestAppUrl, redirectFromRequest, setSessionCookie } from "@/lib/auth";
import { config } from "@/lib/config";
import { exchangeWordPressCredentials } from "@/lib/wordpress";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const applicationPassword = String(formData.get("applicationPassword") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/");

  function redirectToLoginWithError(message: string) {
    const loginUrl = buildRequestAppUrl(request, "/login");
    loginUrl.searchParams.set("error", message);
    return Response.redirect(loginUrl);
  }

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
  } catch (error) {
    console.error("WordPress login exchange failed", error);

    const message =
      error instanceof Error
        ? error.message.includes("404")
          ? "WordPress CRM bridge auth endpoint was not found. Check WORDPRESS_BASE_URL and confirm the bridge plugin is active."
          : error.message.includes("401") || error.message.includes("403")
            ? "WordPress rejected the username or application password."
            : error.message.includes("WORDPRESS_BASE_URL")
              ? "WORDPRESS_BASE_URL is not configured correctly."
              : error.message.includes("fetch failed")
                ? "The CRM could not reach WordPress. Check the production WordPress URL and network access."
                : error.message
        : "Login failed. Check the WordPress username and application password.";

    return redirectToLoginWithError(message);
  }
}
