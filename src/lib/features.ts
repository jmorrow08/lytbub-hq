import type { ProfileSettings } from '@/types';

export const DEFAULT_FEATURES = ['billing'] as const;

export type FeatureFlag = 'billing' | 'dashboard' | 'tasks' | 'ai_summary' | 'admin';

export const ALL_FEATURE_FLAGS: FeatureFlag[] = ['billing', 'dashboard', 'tasks', 'ai_summary', 'admin'];

export const normalizeFeatures = (settings?: Partial<ProfileSettings> | null): FeatureFlag[] => {
  const raw = (settings?.features as string[] | undefined) ?? [];
  const merged = Array.from(new Set([...DEFAULT_FEATURES, ...raw]));
  // Only return known flags to avoid leaking invalid data from the DB
  return merged.filter((flag): flag is FeatureFlag => ALL_FEATURE_FLAGS.includes(flag as FeatureFlag));
};

export const hasFeature = (features: FeatureFlag[] | undefined, feature: FeatureFlag): boolean => {
  if (!features) return false;
  return features.includes(feature);
};
