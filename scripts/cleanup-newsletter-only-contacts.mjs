import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const sampleCount = readSampleCount(process.argv.slice(2));
const startedAt = Date.now();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(buildPoolConfig()),
  log: ["error"]
});

const candidateContactsCte = Prisma.sql`
  WITH candidate_contacts AS (
    SELECT c.id
    FROM "Contact" c
    WHERE c."mergedIntoId" IS NULL
      AND c."isFavorite" = false
      AND COALESCE(cardinality(c."manualRoleTags"), 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM "ManualInteraction" mi
        WHERE mi."contactId" = c.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "UnmatchedEvent" ue
        WHERE ue."assignedContactId" = c.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "MergeAudit" ma
        WHERE ma."primaryContactId" = c.id
           OR ma."mergedContactId" = c.id
      )
      AND EXISTS (
        SELECT 1
        FROM "TimelineEvent" te
        WHERE te."contactId" = c.id
          AND te.source = 'NEWSLETTER'::"SourceSystem"
          AND te."laneKey" = 'EMAIL'::"LaneKey"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "TimelineEvent" te
        WHERE te."contactId" = c.id
          AND (
            te.source <> 'NEWSLETTER'::"SourceSystem"
            OR te."laneKey" <> 'EMAIL'::"LaneKey"
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "ContactEmail" ce
        WHERE ce."contactId" = c.id
          AND ce.source IS DISTINCT FROM 'NEWSLETTER'::"SourceSystem"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "ExternalIdentity" ei
        WHERE ei."contactId" = c.id
          AND ei.source <> 'NEWSLETTER'::"SourceSystem"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "ContactProfileValue" cpv
        WHERE cpv."contactId" = c.id
          AND cpv.source <> 'NEWSLETTER'::"SourceSystem"
      )
  )
`;

try {
  console.log("");
  console.log("Newsletter-only contact cleanup");
  console.log(`Mode: ${applyChanges ? "APPLY" : "DRY RUN"}`);
  console.log(`Sample size: ${sampleCount}`);
  console.log(`Started: ${new Date(startedAt).toISOString()}`);
  console.log("");

  const [candidateCountRow] = await runStep(
    "Counting newsletter-only contact candidates",
    () => prisma.$queryRaw`
      ${candidateContactsCte}
      SELECT COUNT(*)::int AS "contactCount"
      FROM candidate_contacts
    `
  );

  const candidateCount = candidateCountRow?.contactCount ?? 0;
  console.log(`Found ${candidateCount} candidate contacts.`);
  console.log("");

  const [summary] = await runStep(
    "Counting related rows for the candidate set",
    () => prisma.$queryRaw`
    ${candidateContactsCte}
    SELECT
      (SELECT COUNT(*)::int FROM candidate_contacts) AS "contactCount",
      (SELECT COUNT(*)::int FROM "TimelineEvent" te JOIN candidate_contacts cc ON cc.id = te."contactId") AS "timelineEventCount",
      (SELECT COUNT(*)::int FROM "ContactEmail" ce JOIN candidate_contacts cc ON cc.id = ce."contactId") AS "emailCount",
      (SELECT COUNT(*)::int FROM "ContactProfileValue" cpv JOIN candidate_contacts cc ON cc.id = cpv."contactId") AS "profileValueCount",
      (SELECT COUNT(*)::int FROM "ExternalIdentity" ei JOIN candidate_contacts cc ON cc.id = ei."contactId") AS "externalIdentityCount"
    `
  );

  const samples = await runStep(`Loading ${sampleCount} sample candidate contacts`, async () => {
    const sampleContacts = await prisma.$queryRaw`
      ${candidateContactsCte}
      SELECT
        c.id,
        COALESCE(c."displayName", 'Unnamed contact') AS "displayName",
        ce.email AS "primaryEmail"
      FROM candidate_contacts cc
      JOIN "Contact" c ON c.id = cc.id
      LEFT JOIN "ContactEmail" ce ON ce.id = c."primaryEmailId"
      ORDER BY c."updatedAt" DESC, c.id ASC
      LIMIT ${sampleCount}
    `;

    if (sampleContacts.length === 0) {
      return [];
    }

    const sampleIds = sampleContacts.map((contact) => contact.id);
    const newsletterStats = await prisma.timelineEvent.groupBy({
      by: ["contactId"],
      where: {
        contactId: { in: sampleIds },
        source: "NEWSLETTER",
        laneKey: "EMAIL"
      },
      _count: {
        _all: true
      },
      _max: {
        occurredAt: true
      }
    });

    const newsletterStatsByContactId = new Map(
      newsletterStats.map((entry) => [
        entry.contactId,
        {
          newsletterEventCount: entry._count._all,
          lastNewsletterAt: entry._max.occurredAt
        }
      ])
    );

    return sampleContacts.map((contact) => {
      const stats = newsletterStatsByContactId.get(contact.id);

      return {
        id: contact.id,
        displayName: contact.displayName,
        primaryEmail: contact.primaryEmail,
        newsletterEventCount: stats?.newsletterEventCount ?? 0,
        lastNewsletterAt: stats?.lastNewsletterAt ?? null
      };
    });
  });

  console.table([
    {
      contacts: summary?.contactCount ?? 0,
      timelineEvents: summary?.timelineEventCount ?? 0,
      emails: summary?.emailCount ?? 0,
      profileValues: summary?.profileValueCount ?? 0,
      externalIdentities: summary?.externalIdentityCount ?? 0
    }
  ]);

  if (samples.length > 0) {
    console.log("");
    console.log(`Sample candidates (${samples.length})`);
    console.table(samples);
  }

  if (!applyChanges) {
    console.log("");
    console.log(`Dry run completed in ${formatElapsed(Date.now() - startedAt)}.`);
    console.log("No changes made. Re-run with --apply to delete these contacts.");
    process.exit(0);
  }

  const deletedContacts = await runStep("Deleting newsletter-only contacts", () =>
    prisma.$executeRaw`
      ${candidateContactsCte}
      DELETE FROM "Contact"
      WHERE id IN (SELECT id FROM candidate_contacts)
    `
  );

  console.log("");
  console.log(`Apply run completed in ${formatElapsed(Date.now() - startedAt)}.`);
  console.log(`Deleted ${deletedContacts} newsletter-only contacts.`);
} finally {
  await prisma.$disconnect();
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

function readSampleCount(argv) {
  const rawFlag = argv.find((argument) => argument.startsWith("--sample="));
  if (!rawFlag) {
    return 15;
  }

  const parsed = Number(rawFlag.split("=")[1] ?? "15");
  if (!Number.isFinite(parsed)) {
    return 15;
  }

  return Math.max(1, Math.min(Math.trunc(parsed), 100));
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function timestamp() {
  return new Date().toISOString();
}
