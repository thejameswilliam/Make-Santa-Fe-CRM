import { LaneKey as PrismaLaneKey, SourceSystem as PrismaSourceSystem } from "@prisma/client";

import { DEFAULT_INTERACTION_TYPES, DEFAULT_MAPPING_RULES, SOURCE_SYSTEMS } from "@/lib/constants";
import { prisma } from "@/lib/db";

export async function ensureCatalogSeeded() {
  if (!prisma) {
    return;
  }

  for (const source of SOURCE_SYSTEMS.filter((entry) => entry !== "MANUAL")) {
    await prisma.sourceSyncState.upsert({
      where: { source: source as PrismaSourceSystem },
      update: {},
      create: {
        source: source as PrismaSourceSystem
      }
    });
  }

  for (const type of DEFAULT_INTERACTION_TYPES) {
    await prisma.interactionType.upsert({
      where: { slug: type.slug },
      update: {
        name: type.name,
        laneKey: type.laneKey as PrismaLaneKey,
        colorToken: type.colorToken,
        isSystem: type.isSystem,
        isActive: true
      },
      create: {
        name: type.name,
        slug: type.slug,
        laneKey: type.laneKey as PrismaLaneKey,
        colorToken: type.colorToken,
        isSystem: type.isSystem
      }
    });
  }

  for (const rule of DEFAULT_MAPPING_RULES) {
    const existing = await prisma.mappingRule.findFirst({
      where: {
        source: rule.source as PrismaSourceSystem,
        name: rule.name
      }
    });

    if (!existing) {
      await prisma.mappingRule.create({
        data: {
          source: rule.source as PrismaSourceSystem,
          name: rule.name,
          matcherType: rule.matcherType,
          matcherValue: rule.matcherValue,
          eventKind: rule.eventKind,
          laneKey: rule.laneKey as PrismaLaneKey,
          roleKey: "roleKey" in rule ? rule.roleKey ?? null : null,
          priority: rule.priority,
          isActive: true
        }
      });
    }
  }
}
