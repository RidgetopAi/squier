// ============================================
// SQUIRE WEB - COLOR UTILITIES
// ============================================
// Helpers for salience, emotion, and entity coloring

import type { EntityType, EmotionScores } from '@/lib/types';

// Salience to Tailwind class mapping
export function getSalienceColor(salience: number): string {
  const level = Math.min(10, Math.max(1, Math.round(salience * 10)));
  return `salience-${level}`;
}

export function getSalienceGlowClass(salience: number): string {
  const level = Math.min(10, Math.max(1, Math.round(salience * 10)));
  return `salience-glow-${level}`;
}

export function getSalienceBgClass(salience: number): string {
  const level = Math.min(10, Math.max(1, Math.round(salience * 10)));
  return `bg-salience-${level}`;
}

// Salience to opacity (for fade effects)
export function getSalienceOpacity(salience: number): number {
  // Map 0-1 salience to 0.3-1.0 opacity
  return 0.3 + salience * 0.7;
}

// Entity type to color class mapping
const entityColorMap: Record<EntityType, string> = {
  person: 'entity-person',
  organization: 'entity-organization',
  location: 'entity-location',
  project: 'entity-project',
  concept: 'entity-concept',
  event: 'entity-event',
};

export function getEntityColor(type: EntityType): string {
  return entityColorMap[type] || 'entity-concept';
}

export function getEntityBgClass(type: EntityType): string {
  return `bg-${getEntityColor(type)}`;
}

export function getEntityTextClass(type: EntityType): string {
  return `text-${getEntityColor(type)}`;
}

export function getEntityBorderClass(type: EntityType): string {
  return `border-${getEntityColor(type)}`;
}

// Emotion to color mapping
type EmotionType = keyof EmotionScores;

const emotionColorMap: Record<EmotionType, string> = {
  joy: 'emotion-joy',
  sadness: 'emotion-sadness',
  anger: 'emotion-anger',
  fear: 'emotion-fear',
  surprise: 'emotion-surprise',
  disgust: 'emotion-disgust',
};

export function getEmotionColor(emotion: EmotionType): string {
  return emotionColorMap[emotion] || 'emotion-neutral';
}

export function getEmotionTextClass(emotion: EmotionType): string {
  return `text-${getEmotionColor(emotion)}`;
}

export function getEmotionBgClass(emotion: EmotionType): string {
  return `bg-${getEmotionColor(emotion)}`;
}

// Get dominant emotion from scores
export function getDominantEmotion(
  emotions: EmotionScores | undefined
): EmotionType | null {
  if (!emotions) return null;

  let dominant: EmotionType | null = null;
  let maxScore = 0;

  (Object.entries(emotions) as [EmotionType, number | undefined][]).forEach(
    ([emotion, score]) => {
      if (score !== undefined && score > maxScore) {
        maxScore = score;
        dominant = emotion;
      }
    }
  );

  // Only return if score is significant
  return maxScore > 0.3 ? dominant : null;
}

// Emotion icons (using Unicode for now, can swap for icon library later)
export const emotionIcons: Record<EmotionType, string> = {
  joy: '😊',
  sadness: '😢',
  anger: '😠',
  fear: '😨',
  surprise: '😮',
  disgust: '🤢',
};

export function getEmotionIcon(emotion: EmotionType): string {
  return emotionIcons[emotion] || '😐';
}

// Entity type icons
export const entityIcons: Record<EntityType, string> = {
  person: '👤',
  organization: '🏢',
  location: '📍',
  project: '📁',
  concept: '💡',
  event: '📅',
};

export function getEntityIcon(type: EntityType): string {
  return entityIcons[type] || '📌';
}
