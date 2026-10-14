/**
 * Quick reactions at the table (client, 2026-10). A fixed, friendly set — the
 * app maps each id to its picture — so nothing typed by a player is ever
 * shown to the others.
 */
export const EMOTES = new Set([
  'wave', 'smile', 'laugh', 'wow', 'sweat', 'think', 'cool', 'sad', 'clap', 'thumbs', 'fire', 'luck', 'capa',
]);

/** At most one reaction per player every this many ms (no flooding). */
export function emoteCooldownMs(): number {
  return Number(process.env.EMOTE_COOLDOWN_MS ?? '3000');
}
