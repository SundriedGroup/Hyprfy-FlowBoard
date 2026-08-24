import type { Json } from "@/types/database";

type ProfileRecord = {
  display_name: string | null;
  positioning: string | null;
  personal_narrative: string | null;
  content_philosophy: string | null;
  brand_brain: Json;
} | null;

function objectValue(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textValue(value: Json | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeChannelName(value: string) {
  return value === "Newsletter" ? "Substack" : value;
}

export function buildBrandContext(profile: ProfileRecord) {
  const brain = objectValue(profile?.brand_brain);
  const audience = objectValue(brain.audience);
  const voice = objectValue(brain.voice);
  const objectives = objectValue(brain.objectives);
  const pillars = Array.isArray(brain.pillars) ? brain.pillars.flatMap((entry) => {
    const pillar = objectValue(entry);
    const name = textValue(pillar.name);
    if (!name) return [];
    return [{
      name,
      description: textValue(pillar.description),
      targetMixPercent: typeof pillar.percentage === "number" ? pillar.percentage : null,
      preferredFormats: textValue(pillar.formats),
      preferredChannels: Array.isArray(pillar.channels)
        ? pillar.channels.flatMap((channel) => typeof channel === "string" ? [normalizeChannelName(channel)] : [])
        : [],
    }];
  }) : [];
  const activeChannels = Array.isArray(brain.channels) ? brain.channels.flatMap((entry) => {
    const channel = objectValue(entry);
    const rawName = textValue(channel.name);
    if (!rawName || channel.enabled !== true) return [];
    return [{
      name: normalizeChannelName(rawName),
      purpose: textValue(channel.purpose),
      preferredFormats: textValue(channel.formats),
      cadence: textValue(channel.cadence),
      channelTone: textValue(channel.tone),
      primaryCallToAction: textValue(channel.callToAction),
    }];
  }) : [];

  return {
    identity: {
      publicName: profile?.display_name?.trim() ?? "",
      positioning: profile?.positioning?.trim() ?? "",
      personalNarrative: profile?.personal_narrative?.trim() ?? "",
      roleAndCurrentChapter: textValue(brain.roleChapter),
      ageOrLifeStage: textValue(brain.ageLifeStage),
      locationAndTimezone: textValue(brain.locationTimezone),
      interests: textValue(brain.interests),
    },
    mission: {
      statement: textValue(brain.missionStatement),
      longTermAmbition: textValue(brain.longTermAmbition),
      knownFor: textValue(brain.knownFor),
      coreBeliefsAndOpinions: textValue(brain.beliefs),
      contentPhilosophy: profile?.content_philosophy?.trim() ?? "",
    },
    audience: {
      primary: textValue(audience.primary),
      cohort: textValue(audience.cohort),
      goals: textValue(audience.goals),
      problems: textValue(audience.problems),
      naturalLanguage: textValue(audience.language),
      reasonToFollow: textValue(audience.followReason),
      desiredAction: textValue(audience.desiredAction),
    },
    voice: {
      tone: textValue(voice.tone),
      naturalWordsAndPhrases: textValue(voice.naturalPhrases),
      avoid: textValue(voice.avoid),
      opinionsToExpress: textValue(voice.opinions),
      realWritingExamples: textValue(voice.soundsLikeMe),
      rejectedStyle: textValue(voice.notMe),
      formattingPreferences: textValue(voice.formatting),
      vulnerabilityBoundary: textValue(voice.vulnerability),
    },
    objectives: {
      primaryGoal: textValue(objectives.primaryGoal),
      currentOffer: textValue(objectives.currentOffer),
      approvedCallsToAction: textValue(objectives.callsToAction),
      destinations: textValue(objectives.links),
      growthTarget: textValue(objectives.growthTarget),
      desiredOpportunities: textValue(objectives.opportunities),
      conversionDefinition: textValue(objectives.conversion),
    },
    privateBoundaries: textValue(brain.publicBoundaries),
    contentPillars: pillars,
    activeChannels,
  };
}

export type BrandContext = ReturnType<typeof buildBrandContext>;

export function activeChannelNames(context: BrandContext) {
  return [...new Set(context.activeChannels.map((channel) => channel.name))];
}
