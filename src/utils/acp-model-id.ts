/**
 * ACP session `model_id`s are usually a bare model identifier, but some
 * servers compose a trailing "/<effort>" suffix onto the *currently
 * running* model (e.g. a claude-code session running "high" reasoning
 * effort on Sonnet reports `current_model_id: "sonnet/high"`). Rendering
 * that composite id as a picker selection requires knowing which part is
 * the selectable base model — this module does only that split, not
 * anything about reasoning-effort UI, which is M4/M5's job.
 *
 * Only claude-code and codex compose ids this way, and only with a suffix
 * that's actually one of *that server's* known effort levels — gemini-cli,
 * the "custom" preset, and any other/unrecognized server never split, so a
 * literal "/" in one of their ids (part of the model name itself) is left
 * alone.
 */

/**
 * Effort levels each ACP server recognizes as a valid trailing
 * "<base>/<effort>" suffix, keyed by ACP registry key (`ACPProviderConfig.key`
 * / `ACPServerKind`). Mirrors the ACP server's own semantics — keep in sync
 * if a server adds/removes an effort level.
 */
const ACP_MODEL_EFFORT_LEVELS: Readonly<Record<string, readonly string[]>> = {
  "claude-code": ["low", "medium", "high", "xhigh", "max"],
  codex: ["low", "medium", "high", "xhigh"],
  // gemini-cli and the "custom" preset intentionally have no entry — see
  // parseAcpModelId's fallthrough below.
};

export interface ParsedAcpModelId {
  /** The id with any recognized "/<effort>" suffix removed. Equal to the
   * original `id` when there was nothing to split. */
  base: string;
  /** The trailing effort level, or `null` when the id wasn't split. */
  effort: string | null;
}

/**
 * Split a raw ACP `model_id` into its base model and an optional trailing
 * effort suffix.
 *
 * Splits on the LAST "/" only, and only when both (a) `acpServer` is a
 * server known to compose ids this way and (b) the suffix after that "/" is
 * one of *that server's* recognized effort levels — mirroring the ACP
 * server's own semantics exactly, so this never guesses. In every other
 * case (unknown/no server, no "/", unrecognized suffix, or an empty base —
 * e.g. an id that IS just "/high") the id is returned unsplit as `base`
 * with `effort: null`.
 */
export function parseAcpModelId(
  id: string,
  acpServer: string | null | undefined,
): ParsedAcpModelId {
  const levels = acpServer ? ACP_MODEL_EFFORT_LEVELS[acpServer] : undefined;
  if (!levels) {
    return { base: id, effort: null };
  }

  const lastSlashIndex = id.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { base: id, effort: null };
  }

  const base = id.slice(0, lastSlashIndex);
  const suffix = id.slice(lastSlashIndex + 1);
  if (!base || !levels.includes(suffix)) {
    return { base: id, effort: null };
  }

  return { base, effort: suffix };
}
