import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const args = process.argv.slice(2);
const chunkSize = readChunkSize(args);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(buildPoolConfig()),
  log: ["error"]
});

try {
  const startedAt = Date.now();
  console.log("");
  console.log("Rebuilding contact list summaries");
  console.log(`Chunk size: ${chunkSize}`);
  console.log(`Started: ${new Date(startedAt).toISOString()}`);
  console.log("");

  const contacts = await prisma.contact.findMany({
    where: {
      mergedIntoId: null
    },
    select: {
      id: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  console.log(`Found ${contacts.length} contacts to refresh.`);

  let refreshedCount = 0;

  for (let index = 0; index < contacts.length; index += chunkSize) {
    const chunk = contacts.slice(index, index + chunkSize);
    const chunkNumber = Math.floor(index / chunkSize) + 1;
    await runStep(
      `Refreshing contact summary chunk ${chunkNumber} (${chunk.length} contacts)`,
      () => refreshContactListSummaryChunk(prisma, chunk.map((contact) => contact.id))
    );

    refreshedCount += chunk.length;
    console.log(
      `[${timestamp()}] Refreshed ${refreshedCount}/${contacts.length} contacts.`
    );
  }

  console.log("");
  console.log(`Completed at ${new Date().toISOString()} after ${formatElapsed(Date.now() - startedAt)}.`);
} finally {
  await prisma.$disconnect();
}

async function refreshContactListSummaryChunk(prismaClient, contactIds) {
  if (contactIds.length === 0) {
    return;
  }

  const [contacts, timelineEvents, manualInteractions] = await Promise.all([
    prismaClient.contact.findMany({
      where: {
        id: {
          in: contactIds
        }
      },
      select: {
        id: true,
        displayName: true
      }
    }),
    prismaClient.timelineEvent.findMany({
      where: {
        contactId: {
          in: contactIds
        }
      },
      select: {
        contactId: true,
        occurredAt: true,
        laneKey: true,
        eventKind: true,
        amountCents: true,
        metadata: true,
        rawPayload: true
      }
    }),
    prismaClient.manualInteraction.findMany({
      where: {
        contactId: {
          in: contactIds
        }
      },
      select: {
        contactId: true,
        occurredAt: true,
        laneKey: true,
        metadata: true,
        interactionType: {
          select: {
            slug: true
          }
        }
      }
    })
  ]);

  const summaryByContactId = new Map(
    contacts.map((contact) => [
      contact.id,
      {
        displayName: contact.displayName,
        lastInteractionAt: null,
        lastNonEmailInteractionAt: null,
        latestLaneSeenAt: new Map(),
        photoUrl: null,
        photoOccurredAt: 0,
        hasDonorHistory: false,
        donationTotalCents: 0,
        volunteerMinutes: 0,
        spaceUseCount: 0
      }
    ])
  );

  function recordActivity(contactId, laneKey, occurredAt) {
    const summary = summaryByContactId.get(contactId);
    if (!summary) {
      return;
    }

    const occurredAtMs = occurredAt.getTime();

    if (!summary.lastInteractionAt || occurredAtMs > summary.lastInteractionAt.getTime()) {
      summary.lastInteractionAt = occurredAt;
    }

    if (
      laneKey !== "EMAIL" &&
      (!summary.lastNonEmailInteractionAt || occurredAtMs > summary.lastNonEmailInteractionAt.getTime())
    ) {
      summary.lastNonEmailInteractionAt = occurredAt;
    }

    const currentLaneSeenAt = summary.latestLaneSeenAt.get(laneKey) ?? 0;
    if (occurredAtMs > currentLaneSeenAt) {
      summary.latestLaneSeenAt.set(laneKey, occurredAtMs);
    }
  }

  for (const event of timelineEvents) {
    const summary = summaryByContactId.get(event.contactId);
    if (!summary) {
      continue;
    }

    recordActivity(event.contactId, event.laneKey, event.occurredAt);

    if (event.eventKind === "donation") {
      summary.hasDonorHistory = true;
      if (typeof event.amountCents === "number" && event.amountCents > 0) {
        summary.donationTotalCents += event.amountCents;
      }
    }

    if (event.laneKey === "VOLUNTEER") {
      const durationMinutes = Math.max(0, readJsonNumber(toJsonRecord(event.metadata)?.durationMinutes) ?? 0);
      summary.volunteerMinutes += durationMinutes;
    }

    if (event.laneKey === "SPACE_USE") {
      summary.spaceUseCount += 1;
    }

    const photoUrl = extractPhotoUrlFromRawPayload(event.rawPayload);
    const occurredAtMs = event.occurredAt.getTime();
    if (photoUrl && occurredAtMs >= summary.photoOccurredAt) {
      summary.photoUrl = photoUrl;
      summary.photoOccurredAt = occurredAtMs;
    }
  }

  for (const interaction of manualInteractions) {
    const summary = summaryByContactId.get(interaction.contactId);
    if (!summary) {
      continue;
    }

    recordActivity(interaction.contactId, interaction.laneKey, interaction.occurredAt);

    if (interaction.interactionType.slug === "donation") {
      summary.hasDonorHistory = true;
      const amountCents = readAmountCentsFromMetadata(interaction.metadata);
      if (amountCents && amountCents > 0) {
        summary.donationTotalCents += amountCents;
      }
    }

    if (interaction.laneKey === "VOLUNTEER") {
      const durationMinutes = Math.max(0, readJsonNumber(toJsonRecord(interaction.metadata)?.durationMinutes) ?? 0);
      summary.volunteerMinutes += durationMinutes;
    }

    if (interaction.laneKey === "SPACE_USE") {
      summary.spaceUseCount += 1;
    }
  }

  await prismaClient.$transaction(
    contacts.map((contact) => {
      const summary = summaryByContactId.get(contact.id);
      const sortedLanes = [...summary.latestLaneSeenAt.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([laneKey]) => laneKey);

      return prismaClient.contact.update({
        where: {
          id: contact.id
        },
        data: {
          photoUrl: summary.photoUrl,
          recentLaneKeys: sortedLanes.slice(0, 6),
          activityLaneKeys: sortedLanes,
          lastInteractionAt: summary.lastInteractionAt,
          lastNonEmailInteractionAt: summary.lastNonEmailInteractionAt,
          hasDonorHistory: summary.hasDonorHistory,
          donationTotalCents: summary.donationTotalCents,
          volunteerMinutes: summary.volunteerMinutes,
          spaceUseCount: summary.spaceUseCount,
          lastNameSortValue: buildLastNameSortValue(summary.displayName)
        }
      });
    })
  );
}

function buildPoolConfig() {
  if (!process.env.DATABASE_CA_CERT) {
    return {
      connectionString: process.env.DATABASE_URL
    };
  }

  return {
    connectionString: stripSslModeFromConnectionString(process.env.DATABASE_URL),
    ssl: {
      ca: process.env.DATABASE_CA_CERT,
      rejectUnauthorized: true
    }
  };
}

function stripSslModeFromConnectionString(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function readChunkSize(inputArgs) {
  const chunkArg = inputArgs.find((arg) => arg.startsWith("--chunk="));
  if (!chunkArg) {
    return 50;
  }

  const parsed = Number(chunkArg.slice("--chunk=".length));
  return Number.isFinite(parsed) ? Math.max(10, Math.min(parsed, 1000)) : 50;
}

function timestamp() {
  return new Date().toISOString();
}

function buildLastNameSortValue(displayName) {
  const normalized = displayName?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  return parts[parts.length - 1] ?? "";
}

function toJsonRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function readJsonNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readAmountCentsFromMetadata(metadata) {
  const record = toJsonRecord(metadata);
  const amountCents = readJsonNumber(record?.amountCents);

  if (amountCents === null) {
    return null;
  }

  return Math.round(amountCents);
}

function extractPhotoUrlFromRawPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const profile = rawPayload.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }

  const photoUrl = profile.photoUrl;
  if (typeof photoUrl !== "string" || !photoUrl.trim()) {
    return null;
  }

  return photoUrl.trim();
}

async function runStep(label, work) {
  const stepStartedAt = Date.now();
  console.log(`[${timestamp()}] ${label}...`);

  const heartbeat = setInterval(() => {
    console.log(`[${timestamp()}] ${label} still running (${formatElapsed(Date.now() - stepStartedAt)})...`);
  }, 5000);

  if (typeof heartbeat.unref === "function") {
    heartbeat.unref();
  }

  try {
    const result = await work();
    console.log(`[${timestamp()}] ${label} complete in ${formatElapsed(Date.now() - stepStartedAt)}.`);
    return result;
  } finally {
    clearInterval(heartbeat);
  }
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
