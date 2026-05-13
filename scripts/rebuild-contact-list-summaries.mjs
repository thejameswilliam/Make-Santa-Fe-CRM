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

  const contactIdSql = Prisma.join(contactIds.map((contactId) => Prisma.sql`${contactId}`));

  await prismaClient.$executeRaw`
    WITH target_contacts AS (
      SELECT
        c.id,
        COALESCE(BTRIM(c."displayName"), '') AS "displayName"
      FROM "Contact" c
      WHERE c.id IN (${contactIdSql})
    ),
    combined_activities AS (
      SELECT
        te."contactId",
        te."occurredAt",
        te."laneKey",
        te."eventKind",
        te."amountCents",
        te.metadata::jsonb AS metadata,
        te."rawPayload"::jsonb AS "rawPayload",
        NULL::text AS "interactionSlug"
      FROM "TimelineEvent" te
      JOIN target_contacts tc ON tc.id = te."contactId"

      UNION ALL

      SELECT
        mi."contactId",
        mi."occurredAt",
        mi."laneKey",
        NULL::text AS "eventKind",
        NULL::integer AS "amountCents",
        mi.metadata::jsonb AS metadata,
        NULL::jsonb AS "rawPayload",
        it.slug AS "interactionSlug"
      FROM "ManualInteraction" mi
      JOIN "InteractionType" it ON it.id = mi."interactionTypeId"
      JOIN target_contacts tc ON tc.id = mi."contactId"
    ),
    activity_rollup AS (
      SELECT
        tc.id AS "contactId",
        MAX(ca."occurredAt") AS "lastInteractionAt",
        MAX(ca."occurredAt") FILTER (WHERE ca."laneKey" <> 'EMAIL'::"LaneKey") AS "lastNonEmailInteractionAt"
      FROM target_contacts tc
      LEFT JOIN combined_activities ca ON ca."contactId" = tc.id
      GROUP BY tc.id
    ),
    lane_rollup AS (
      SELECT
        tc.id AS "contactId",
        COALESCE(
          ARRAY(
            SELECT lane_rows."laneKey"
            FROM (
              SELECT
                ca."laneKey",
                MAX(ca."occurredAt") AS "lastSeenAt"
              FROM combined_activities ca
              WHERE ca."contactId" = tc.id
              GROUP BY ca."laneKey"
              ORDER BY "lastSeenAt" DESC, ca."laneKey" ASC
              LIMIT 6
            ) AS lane_rows
          ),
          ARRAY[]::"LaneKey"[]
        ) AS "recentLaneKeys",
        COALESCE(
          ARRAY(
            SELECT lane_rows."laneKey"
            FROM (
              SELECT
                ca."laneKey",
                MAX(ca."occurredAt") AS "lastSeenAt"
              FROM combined_activities ca
              WHERE ca."contactId" = tc.id
              GROUP BY ca."laneKey"
              ORDER BY "lastSeenAt" DESC, ca."laneKey" ASC
            ) AS lane_rows
          ),
          ARRAY[]::"LaneKey"[]
        ) AS "activityLaneKeys"
      FROM target_contacts tc
    ),
    photo_rollup AS (
      SELECT DISTINCT ON (te."contactId")
        te."contactId",
        NULLIF(BTRIM(te."rawPayload"::jsonb -> 'profile' ->> 'photoUrl'), '') AS "photoUrl"
      FROM "TimelineEvent" te
      JOIN target_contacts tc ON tc.id = te."contactId"
      WHERE NULLIF(BTRIM(te."rawPayload"::jsonb -> 'profile' ->> 'photoUrl'), '') IS NOT NULL
      ORDER BY te."contactId", te."occurredAt" DESC
    ),
    metrics_rollup AS (
      SELECT
        tc.id AS "contactId",
        COALESCE(
          SUM(
            CASE
              WHEN ca."eventKind" = 'donation' AND ca."amountCents" IS NOT NULL THEN ca."amountCents"
              ELSE 0
            END
          ),
          0
        ) +
        COALESCE(
          SUM(
            CASE
              WHEN ca."interactionSlug" = 'donation' AND jsonb_typeof(ca.metadata -> 'amountCents') = 'number'
                THEN ROUND((ca.metadata ->> 'amountCents')::numeric)::int
              ELSE 0
            END
          ),
          0
        ) AS "donationTotalCents",
        COALESCE(
          BOOL_OR(ca."eventKind" = 'donation' OR ca."interactionSlug" = 'donation'),
          false
        ) AS "hasDonorHistory",
        COALESCE(
          SUM(
            CASE
              WHEN ca."laneKey" = 'VOLUNTEER'::"LaneKey" AND jsonb_typeof(ca.metadata -> 'durationMinutes') = 'number'
                THEN GREATEST(ROUND((ca.metadata ->> 'durationMinutes')::numeric)::int, 0)
              ELSE 0
            END
          ),
          0
        ) AS "volunteerMinutes",
        COALESCE(
          SUM(
            CASE
              WHEN ca."laneKey" = 'SPACE_USE'::"LaneKey" THEN 1
              ELSE 0
            END
          ),
          0
        ) AS "spaceUseCount"
      FROM target_contacts tc
      LEFT JOIN combined_activities ca ON ca."contactId" = tc.id
      GROUP BY tc.id
    ),
    summary AS (
      SELECT
        tc.id AS "contactId",
        ar."lastInteractionAt",
        ar."lastNonEmailInteractionAt",
        lr."recentLaneKeys",
        lr."activityLaneKeys",
        pr."photoUrl",
        mr."hasDonorHistory",
        mr."donationTotalCents",
        mr."volunteerMinutes",
        mr."spaceUseCount",
        CASE
          WHEN tc."displayName" = '' THEN ''
          ELSE LOWER(REGEXP_REPLACE(tc."displayName", '^.*\\s+', ''))
        END AS "lastNameSortValue"
      FROM target_contacts tc
      LEFT JOIN activity_rollup ar ON ar."contactId" = tc.id
      LEFT JOIN lane_rollup lr ON lr."contactId" = tc.id
      LEFT JOIN photo_rollup pr ON pr."contactId" = tc.id
      LEFT JOIN metrics_rollup mr ON mr."contactId" = tc.id
    )
    UPDATE "Contact" c
    SET
      "lastInteractionAt" = summary."lastInteractionAt",
      "lastNonEmailInteractionAt" = summary."lastNonEmailInteractionAt",
      "recentLaneKeys" = summary."recentLaneKeys",
      "activityLaneKeys" = summary."activityLaneKeys",
      "photoUrl" = summary."photoUrl",
      "hasDonorHistory" = summary."hasDonorHistory",
      "donationTotalCents" = summary."donationTotalCents",
      "volunteerMinutes" = summary."volunteerMinutes",
      "spaceUseCount" = summary."spaceUseCount",
      "lastNameSortValue" = summary."lastNameSortValue"
    FROM summary
    WHERE c.id = summary."contactId"
  `;
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
