export const brandChannels = ["Instagram", "X", "Facebook", "TikTok", "LinkedIn", "YouTube", "Substack", "Blog"] as const;

export type BrandChannelName = (typeof brandChannels)[number];

export interface ContentPillar {
  id: string;
  name: string;
  description: string;
  percentage: number;
  formats: string;
  channels: string[];
}

export interface ChannelStrategy {
  name: BrandChannelName;
  enabled: boolean;
  purpose: string;
  formats: string;
  cadence: string;
  tone: string;
  callToAction: string;
}

export interface BrandBrain {
  ageLifeStage: string;
  locationTimezone: string;
  roleChapter: string;
  missionStatement: string;
  longTermAmbition: string;
  knownFor: string;
  beliefs: string;
  interests: string;
  publicBoundaries: string;
  audience: {
    primary: string;
    cohort: string;
    goals: string;
    problems: string;
    language: string;
    followReason: string;
    desiredAction: string;
  };
  voice: {
    tone: string;
    naturalPhrases: string;
    avoid: string;
    opinions: string;
    soundsLikeMe: string;
    notMe: string;
    formatting: string;
    vulnerability: string;
  };
  objectives: {
    primaryGoal: string;
    currentOffer: string;
    callsToAction: string;
    links: string;
    growthTarget: string;
    opportunities: string;
    conversion: string;
  };
  pillars: ContentPillar[];
  channels: ChannelStrategy[];
}

export interface BrandProfileForm {
  displayName: string;
  positioning: string;
  personalNarrative: string;
  contentPhilosophy: string;
  brain: BrandBrain;
}

export interface WeeklyBriefData {
  mainObjective: string;
  whatsHappening: string;
  importantDates: string;
  keyStory: string;
  businessFocus: string;
  coreMessage: string;
  contentOpportunities: string;
  audienceQuestions: string;
  availableMinutes: string;
  filmingDays: string;
  existingAssets: string;
  energyCapacity: string;
  doNotPublish: string;
  changed: string;
  learned: string;
  strugglingWith: string;
  excitedAbout: string;
  developingOpinion: string;
  showNotTell: string;
  vlogBank: string;
}

export const emptyBrandBrain = (): BrandBrain => ({
  ageLifeStage: "",
  locationTimezone: "",
  roleChapter: "",
  missionStatement: "",
  longTermAmbition: "",
  knownFor: "",
  beliefs: "",
  interests: "",
  publicBoundaries: "",
  audience: { primary: "", cohort: "", goals: "", problems: "", language: "", followReason: "", desiredAction: "" },
  voice: { tone: "", naturalPhrases: "", avoid: "", opinions: "", soundsLikeMe: "", notMe: "", formatting: "", vulnerability: "" },
  objectives: { primaryGoal: "", currentOffer: "", callsToAction: "", links: "", growthTarget: "", opportunities: "", conversion: "" },
  pillars: [],
  channels: brandChannels.map((name) => ({ name, enabled: name === "Instagram" || name === "X", purpose: "", formats: "", cadence: "", tone: "", callToAction: "" })),
});

export const emptyWeeklyBrief = (): WeeklyBriefData => ({
  mainObjective: "", whatsHappening: "", importantDates: "", keyStory: "", businessFocus: "", coreMessage: "",
  contentOpportunities: "", audienceQuestions: "", availableMinutes: "", filmingDays: "", existingAssets: "",
  energyCapacity: "", doNotPublish: "", changed: "", learned: "", strugglingWith: "", excitedAbout: "",
  developingOpinion: "", showNotTell: "", vlogBank: "",
});
