export type Language = 'ko' | 'en' | 'ja';
export type Theme = 'dark' | 'light';
export type Mood = 'Panic' | 'Calm' | 'Greed' | 'Innovation' | 'Conflict';

export interface MoodData {
  country: string;
  countryCode: string;
  mood: Mood;
  word: string;
  subTopics: string[];
  reason: string;
  bpm: number;
  color: string;
  updatedAt?: string;
  translations?: Record<Language, {
    word: string;
    subTopics: string[];
    reason: string;
    country: string;
  }>;
}

export interface GlobalState {
  language: Language;
  theme: Theme;
  selectedCountry: MoodData | null;
  globalMood: Mood;
  pulseRate: number;
}
