import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const sampleCount = readSampleCount(process.argv.slice(2));

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
  const [summary] = await prisma.$queryRaw`
    ${candidateContactsCte}
    SELECT
      (SELECT COUNT(*)::int FROM candidate_contacts) AS "contactCount",
      (SELECT COUNT(*)::int FROM "TimelineEvent" te JOIN candidate_contacts cc ON cc.id = te."contactId") AS "timelineEventCount",
      (SELECT COUNT(*)::int FROM "ContactEmail" ce JOIN candidate_contacts cc ON cc.id = ce."contactId") AS "emailCount",
      (SELECT COUNT(*)::int FROM "ContactProfileValue" cpv JOIN candidate_contacts cc ON cc.id = cpv."contactId") AS "profileValueCount",
      (SELECT COUNT(*)::int FROM "ExternalIdentity" ei JOIN candidate_contacts cc ON cc.id = ei."contactId") AS "externalIdentityCount"
  `;

  const samples = await prisma.$queryRaw`
    ${candidateContactsCte}
    SELECT
      c.id,
      COALESCE(c."displayName", 'Unnamed contact') AS "displayName",
      ce.email AS "primaryEmail",
      COUNT(te.id)::int AS "newsletterEventCount",
      MAX(te."occurredAt") AS "lastNewsletterAt"
    FROM candidate_contacts cc
    JOIN "Contact" c ON c.id = cc.id
    LEFT JOIN "ContactEmail" ce ON ce.id = c."primaryEmailId"
    LEFT JOIN "TimelineEvent" te ON te."contactId" = c.id
    GROUP BY c.id, c."displayName", ce.email
    ORDER BY MAX(te."occurredAt") DESC NULLS LAST, c.id ASC
    LIMIT ${sampleCount}
  `;

  console.log("");
  console.log("Newsletter-only contact cleanup");
  console.log(`Mode: ${applyChanges ? "APPLY" : "DRY RUN"}`);
  console.log("");
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
    console.log("No changes made. Re-run with --apply to delete these contacts.");
    process.exit(0);
  }

  const deletedContacts = await prisma.$executeRaw`
    ${candidateContactsCte}
    DELETE FROM "Contact"
    WHERE id IN (SELECT id FROM candidate_contacts)
  `;

  console.log("");
  console.log(`Deleted ${deletedContacts} newsletter-only contacts.`);
} finally {
  await prisma.$disconnect();
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
