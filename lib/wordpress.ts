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

function buildWordPressUrl(path: string) {
  if (!config.wordpressBaseUrl) {
    throw new Error("WORDPRESS_BASE_URL is not configured.");
  }

  return new URL(path.replace(/^\//, ""), `${config.wordpressBaseUrl.replace(/\/$/, "")}/`).toString();
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WordPress bridge request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function exchangeWordPressCredentials(username: string, applicationPassword: string) {
  const response = await fetch(buildWordPressUrl("/wp-json/make-santa-fe-crm/v1/auth/exchange"), {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`
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

  const response = await fetch(buildWordPressUrl(`/wp-json/make-santa-fe-crm/v1/sync/${source.toLowerCase()}?${params.toString()}`), {
    headers: {
      "X-MSFCrm-Token": config.wordpressBridgeToken
    },
    cache: "no-store"
  });

  return parseJsonResponse<WordPressEventFeed>(response);
}

export async function fetchSourceMetadata(source: SourceSystemKey) {
  const response = await fetch(buildWordPressUrl(`/wp-json/make-santa-fe-crm/v1/metadata/${source.toLowerCase()}`), {
    headers: {
      "X-MSFCrm-Token": config.wordpressBridgeToken
    },
    cache: "no-store"
  });

  return parseJsonResponse<WordPressMetadataFeed>(response);
}
