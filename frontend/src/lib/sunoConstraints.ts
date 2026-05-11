/**
 * Suno API hard limits. Sourced from https://docs.sunoapi.org/.
 *
 * These are enforced both client-side (UI counters / disabled submit) and
 * server-side (Pydantic ``max_length`` on request models). Keep in sync.
 *
 * Re-export as constants — DO NOT inline these numbers anywhere. If Suno
 * bumps a limit, only this file changes.
 */

/** /api/v1/generate */
export const SUNO_LIMITS = {
  /** Custom-mode title (also shown in the audio metadata). */
  TITLE_MAX: 80,
  /** ``style`` field for custom-mode song / instrumental / cover. */
  STYLE_MAX: 1000,
  /** ``prompt`` field for non-custom mode (idea-driven generation). */
  DESCRIPTION_MAX: 1000,
  /** Custom lyrics — applies to song + cover with vocals. */
  LYRICS_MAX: 5000,
  /** /api/v1/generate/sounds — concise SFX prompt. */
  SFX_PROMPT_MAX: 500,
  /** /api/v1/generate/upload-cover — short style brief. */
  COVER_STYLE_MAX: 500,
  /** /api/v1/generate/upload-cover — max input audio length (minutes). */
  COVER_AUDIO_MAX_MIN: 8,
  /** Allowed audio formats for cover / extend uploads. */
  COVER_AUDIO_FORMATS: ["mp3", "wav", "m4a", "ogg"] as const,
  /** /api/v1/generate/extend — max input audio length (minutes). */
  EXTEND_AUDIO_MAX_MIN: 8,
} as const;

export type SunoAudioFormat = (typeof SUNO_LIMITS.COVER_AUDIO_FORMATS)[number];

/** Returns the max-length attribute string for a given Suno-mapped field. */
export function maxLenAttr(limit: number): { maxLength: number } {
  return { maxLength: limit };
}

/** Compute remaining characters (negative when over the limit). */
export function charsLeft(value: string, limit: number): number {
  return limit - value.length;
}
