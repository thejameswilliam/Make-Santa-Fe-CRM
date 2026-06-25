import { config } from "@/lib/config";
import type {
  SourceSystemKey,
} from "@/lib/constants";
import type {
  SessionUser,
  SyncModeKey,
  WordPressEventFeed,
  WordPressMetadataFeed
} from "@/lib/types";

const RETRYABLE_WORDPRESS_STATUS_CODES = new Set([429, 502, 503, 504]);

function buildWordPressUrl(path: string) {
  if (!config.wordpressBaseUrl) {
    throw new Error("WORDPRESS_BASE_URL is not configured.");
  }

  try {
    return new URL(path.replace(/^\//, ""), `${config.wordpressBaseUrl.replace(/\/$/, "")}/`).toString();
  } catch {
    throw new Error(
      "WORDPRESS_BASE_URL is invalid. Use a full site URL like https://www.makesantafe.org"
    );
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    const compactBody = body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

    throw new Error(
      compactBody
        ? `WordPress bridge request failed (${response.status}): ${compactBody}`
        : `WordPress bridge request failed (${response.status}).`
    );
  }

  return (await response.json()) as T;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfterMilliseconds(response: Response) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

function isRetryableWordPressStatus(status: number) {
  return RETRYABLE_WORDPRESS_STATUS_CODES.has(status);
}

function isTransientWordPressFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up")
  );
}

async function requestWordPressJsonWithRetry<T>(path: string, init: RequestInit, options?: {
  retries?: number;
  retryDelayMs?: number;
}) {
  const retries = options?.retries ?? 0;
  const retryDelayMs = options?.retryDelayMs ?? 0;
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(buildWordPressUrl(path), {
        ...init,
        cache: "no-store"
      });

      if (!response.ok && isRetryableWordPressStatus(response.status) && attempt < retries) {
        const retryAfterMs = parseRetryAfterMilliseconds(response);
        await response.text().catch(() => "");
        await sleep(retryAfterMs ?? retryDelayMs * Math.max(1, attempt + 1));
        attempt += 1;
        continue;
      }

      return await parseJsonResponse<T>(response);
    } catch (error) {
      if (attempt >= retries || !isTransientWordPressFetchError(error)) {
        throw error;
      }

      await sleep(retryDelayMs * Math.max(1, attempt + 1));
      attempt += 1;
    }
  }
}

export async function exchangeWordPressCredentials(username: string, applicationPassword: string) {
  const normalizedUsername = username.trim();
  const normalizedApplicationPassword = applicationPassword.replace(/\s+/g, "");

  const response = await fetch(buildWordPressUrl("/wp-json/make-santa-fe-crm/v1/auth/exchange"), {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${normalizedUsername}:${normalizedApplicationPassword}`).toString("base64")}`
    },
    cache: "no-store"
  });

  const payload = await parseJsonResponse<{
    user: {
      id: number;
      name: string;
      email: string;
    };
  }>(response);

  const user: SessionUser = {
    id: `wp-${payload.user.id}`,
    name: payload.user.name,
    email: payload.user.email,
    wordpressUserId: payload.user.id
  };

  return user;
}

export async function fetchSourceEvents(source: SourceSystemKey, options: {
  mode: SyncModeKey;
  cursor?: string | null;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    mode: options.mode,
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 100)
  });

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  return requestWordPressJsonWithRetry<WordPressEventFeed>(
    `/wp-json/make-santa-fe-crm/v1/sync/${source.toLowerCase()}?${params.toString()}`,
    {
      headers: {
        "X-MSFCrm-Token": config.wordpressBridgeToken
      }
    },
    {
      retries: config.wordpressSyncRetryCount,
      retryDelayMs: config.wordpressSyncRetryDelayMs
    }
  );
}

export async function fetchSourceMetadata(source: SourceSystemKey) {
  return requestWordPressJsonWithRetry<WordPressMetadataFeed>(
    `/wp-json/make-santa-fe-crm/v1/metadata/${source.toLowerCase()}`,
    {
      headers: {
        "X-MSFCrm-Token": config.wordpressBridgeToken
      }
    },
    {
      retries: config.wordpressSyncRetryCount,
      retryDelayMs: config.wordpressSyncRetryDelayMs
    }
  );
}
