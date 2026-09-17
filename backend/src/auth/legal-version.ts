/**
 * Which version of the Termos de Uso + Política de Privacidade a player accepted.
 *
 * Stored on the user at registration, so a dispute can be answered with "this
 * person accepted this version on this date". Bump it whenever the lawyer
 * issues new documents — old accounts keep the version they actually agreed to,
 * and re-acceptance becomes a separate, deliberate decision.
 */
export const LEGAL_VERSION = '2026-09-15';
