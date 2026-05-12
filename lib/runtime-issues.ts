export interface RuntimeIssue {
  title: string;
  detail: string;
  technicalDetail?: string | null;
}

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message.trim();
  }

  return "";
}

export function getRuntimeIssue(error: unknown, pageLabel: string): RuntimeIssue {
  const rawMessage = messageFromError(error);
  const technicalDetail = rawMessage ? rawMessage.slice(0, 280) : null;
  const message = rawMessage.toLowerCase();

  if (
    message.includes("p2021") ||
    message.includes("p2022") ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  ) {
    return {
      title: "Database schema is not ready",
      detail:
        "The app connected to Postgres, but the production schema does not match the code yet. Run the schema sync job or apply Prisma schema changes before using the CRM.",
      technicalDetail
    };
  }

  if (message.includes("database_url")) {
    return {
      title: "Database is not configured",
      detail:
        "The production app does not have a usable DATABASE_URL yet. Confirm the managed Postgres binding is attached to the web service and deployment job.",
      technicalDetail
    };
  }

  if (
    message.includes("can't reach database server") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("connection terminated") ||
    message.includes("connection refused")
  ) {
    return {
      title: "Database connection failed",
      detail:
        "The app started, but it could not reach the production Postgres database. Check the managed database binding, network routing, and database status in DigitalOcean.",
      technicalDetail
    };
  }

  return {
    title: `${pageLabel} could not load`,
    detail:
      "The app hit a server-side runtime error while loading this page. Check the DigitalOcean runtime logs for the web service to see the exact stack trace.",
    technicalDetail
  };
}
