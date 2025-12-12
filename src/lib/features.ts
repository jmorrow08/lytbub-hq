import type { ProfileSettings } from '@/types';

export const DEFAULT_FEATURES = ['billing'] as const;

export type FeatureFlag = 'billing' | 'dashboard' | 'tasks' | 'ai_summary' | 'admin';

export const normalizeFeatures = (settings?: Partial<ProfileSettings> | null): FeatureFlag[] => {
  const raw = (settings?.features as string[] | undefined) ?? [];
  const merged = Array.from(new Set([...DEFAULT_FEATURES, ...raw]));
  return merged.filter(Boolean) as FeatureFlag[];
};

export const hasFeature = (features: FeatureFlag[] | undefined, feature: FeatureFlag): boolean => {
  if (!features) return false;
  return features.includes(feature);
};
