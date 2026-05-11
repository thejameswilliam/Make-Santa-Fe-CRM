import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/types";

const SESSION_COOKIE = "msf_crm_session";

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string) {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser) {
  const payload = toBase64Url(
    JSON.stringify({
      ...user,
      issuedAt: new Date().toISOString()
    })
  );
  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token?: string | null): SessionUser | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = signValue(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as SessionUser;
    if (!parsed?.id || !parsed?.email || !parsed?.name) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value ?? null);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export function getSessionFromRequest(request: NextRequest) {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value ?? null);
}

function normalizeRedirectTarget(target: string) {
  const trimmed = target.trim();
  if (!trimmed) {
    return "/";
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  return "/";
}

export function getRequestAppOrigin(request: NextRequest) {
  if (config.appBaseUrl) {
    return config.appBaseUrl;
  }

  const forwarded = request.headers.get("forwarded");
  if (forwarded) {
    const hostMatch = forwarded.match(/host=([^;,\s]+)/i);
    const protoMatch = forwarded.match(/proto=([^;,\s]+)/i);
    if (hostMatch?.[1]) {
      const proto = protoMatch?.[1] ?? "https";
      return `${proto}://${hostMatch[1]}`;
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.split(",")[0]?.trim();
  if (host) {
    const requestUrl = new URL(request.url);
    const proto = forwardedProto || requestUrl.protocol.replace(":", "") || "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export function buildRequestAppUrl(request: NextRequest, target: string) {
  const origin = getRequestAppOrigin(request);
  const pathname = normalizeRedirectTarget(target);
  return new URL(pathname, `${origin}/`);
}

export function redirectFromRequest(request: NextRequest, target: string) {
  return NextResponse.redirect(buildRequestAppUrl(request, target));
}

export function setSessionCookie(response: NextResponse, user: SessionUser) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(user),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    maxAge: 0
  });
}
