export const GOODBOT_START = '<!-- goodbot:start -->';
export const GOODBOT_END = '<!-- goodbot:end -->';

export type ExistingFileStrategy = 'merge' | 'overwrite' | 'skip';

export type FileWriteAction =
  | 'create'       // File doesn't exist — write generated content
  | 'overwrite'    // Existing file will be fully replaced
  | 'merge'        // Generated content merged with existing (markers replace section)
  | 'skip'         // Pre-existing user file, skipped per strategy
  | 'no-change';   // Existing content already matches what we'd write

export interface FileWriteDecision {
  action: FileWriteAction;
  content: string;
}

/**
 * Merge goodbot-generated content with existing file content.
 *
 * If existing content already has goodbot markers, the section between them
 * is replaced and everything outside the markers is preserved. If there are
 * no markers, the new content is prepended (wrapped in markers) above the
 * existing content.
 */
export function mergeGoodbotContent(generated: string, existing: string): string {
  const startIdx = existing.indexOf(GOODBOT_START);
  const endIdx = existing.indexOf(GOODBOT_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + GOODBOT_END.length);
    return `${before}${GOODBOT_START}\n${generated}\n${GOODBOT_END}${after}`;
  }

  return `${GOODBOT_START}\n${generated}\n${GOODBOT_END}\n\n${existing}`;
}

/**
 * Decide what to do with a single generated file given the existing file state.
 *
 * Pure function — makes no filesystem calls. The caller is responsible for
 * reading the existing file and writing the returned content.
 *
 * Key invariant: if the existing file contains goodbot markers, we ALWAYS
 * replace just the marker section (preserving user content outside). Markers
 * are the contract — they mean "goodbot owns this block, user owns the rest."
 */
export function decideFileWrite(params: {
  generated: string;
  existing: string | null;
  mergeWithExisting: boolean;
  strategy: ExistingFileStrategy;
  checksumExists: boolean;
}): FileWriteDecision {
  const { generated, existing, mergeWithExisting, strategy, checksumExists } = params;

  // Non-mergeable files (e.g. CODING_GUIDELINES.md) always get overwritten
  if (!mergeWithExisting) {
    if (existing === null) return { action: 'create', content: generated };
    if (existing === generated) return { action: 'no-change', content: generated };
    return { action: 'overwrite', content: generated };
  }

  // New file — write plain generated content
  if (existing === null) {
    return { action: 'create', content: generated };
  }

  // Existing file has goodbot markers — always replace section, preserve user content outside
  const hasMarkers =
    existing.includes(GOODBOT_START) && existing.includes(GOODBOT_END);

  if (hasMarkers) {
    const merged = mergeGoodbotContent(generated, existing);
    if (merged === existing) return { action: 'no-change', content: merged };
    return { action: 'merge', content: merged };
  }

  // No markers, but goodbot wrote this file before — fully overwrite
  if (checksumExists) {
    if (existing === generated) return { action: 'no-change', content: generated };
    return { action: 'overwrite', content: generated };
  }

  // Pre-existing user file — apply the configured strategy
  if (strategy === 'skip') return { action: 'skip', content: existing };
  if (strategy === 'overwrite') {
    if (existing === generated) return { action: 'no-change', content: generated };
    return { action: 'overwrite', content: generated };
  }

  // strategy === 'merge' — wrap generated content in markers and prepend
  return { action: 'merge', content: mergeGoodbotContent(generated, existing) };
}
