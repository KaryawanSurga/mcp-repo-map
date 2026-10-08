export const DEFAULT_BUDGET = 900;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Clamp text to an approximate token budget, cutting on a line boundary.
 */
export function clampToBudget(
  text: string,
  budget: number,
): { text: string; tokens: number; truncated: boolean } {
  const tokens = estimateTokens(text);
  if (tokens <= budget) {
    return { text, tokens, truncated: false };
  }
  const maxChars = budget * 4;
  const head = text.slice(0, maxChars);
  const lastNewline = head.lastIndexOf("\n");
  const clamped = lastNewline > 0 ? head.slice(0, lastNewline) : head;
  return { text: clamped, tokens: estimateTokens(clamped), truncated: true };
}
