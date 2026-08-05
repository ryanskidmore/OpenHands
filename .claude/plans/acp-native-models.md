# ACP Native Models Plan — research + file map

Companion to the `/goal` "Native multi-model + effort UX for ACP agents". Read this
plus `PROGRESS.md` (created in M0) and `git log` before resuming work. Commit this
file on the `feat/acp-native-models` branch in M0.

## Workflow (both repos: OpenHands + software-agent-sdk forks)

- Integration branch: `feat/acp-native-models`, cut from `main`. Never commit or
  PR to `main`.
- Each milestone/sized chunk happens on a short-lived branch off the integration
  branch: `acp-models/mN-<slug>` (e.g. `acp-models/m1-modelsdev-catalog`).
  Commit per completed task, push to origin, then
  `gh pr create --base feat/acp-native-models` on the ryanskidmore fork.
- Never merge these PRs yourself — Ryan reviews and merges them into the
  integration branch; that branch is eventually PR'd back upstream.
- If the next chunk depends on a not-yet-merged PR, stack: branch off that PR's
  branch and note the dependency in the new PR's body.
- PR bodies: what/why, test evidence, and any degradation behavior on stock
  servers.

## Architecture (research, 2026-08-05)

This repo is **Agent Canvas** (`@openhands/agent-canvas`) — TS/React frontend only.
Chain: Canvas → HTTP → Agent Server (Python, `OpenHands/software-agent-sdk`,
image `ghcr.io/openhands/agent-server`, uvx-installed by `scripts/dev-safe.mjs`)
→ spawns ACP agent CLI (claude-agent-acp / codex-acp / gemini-cli) over
JSON-RPC/stdio. **Canvas never speaks ACP** — the server/SDK is the ACP client.
Generated mirror: `@openhands/typescript-client` 1.36.1. Python `acp` lib pinned
`<0.11` (`config/defaults.json:12`). Min server 1.28.0; profile schema is
`extra="forbid"` — unknown fields 400 (precedent: acp_isolate_data_dir TODO at
`src/api/agent-server-adapter.ts:749`).

## What exists / what's missing

- Mid-session model switch WORKS: `POST .../switch_acp_model` →
  `agent-server-conversation-service.api.ts:841` (local/cloud split), orchestrated
  by `src/hooks/mutation/use-switch-acp-model.ts` (conversation → live switch;
  home → persist to active profile; legacy → agent_settings_diff).
- `acp_model` is a single scalar per profile (`src/routes/agent-settings.tsx:98`).
- Model lists are STATIC SDK-registry mirrors (`src/constants/acp-providers.ts:151`);
  custom ACP servers get no picker (`use-chat-input-model-state.ts:99` gates on
  `available_models.length > 0`).
- Effort: no first-class concept; Codex smuggles it as `gpt-5.5/medium`
  (`tests/e2e/live-acp/harness.mts:111`). Live session data reaching Canvas today:
  only `current_model_id/current_model_name` (`agent-server-adapter.ts:81`).
- Session modes: `acp_session_mode` stored but zero Canvas UI.

## Protocol facts

- ACP spec (v1 stable): old `session/set_model` was REMOVED pre-1.0. Stable surface
  = Session Config Options: `session/new` returns `configOptions[]` (categories
  `model`, `thought_level`, `model_config`, `mode`), switch via
  `session/set_config_option`, agent-initiated `config_option_update`.
- claude-agent-acp adapter (`@agentclientprotocol/claude-agent-acp`) advertises
  models/config options itself. Claude effort levels: low/medium/high/xhigh/max.
  Payload details disputed between sources — M0 spike must verify against the
  actual adapter version.
- models.dev: `https://models.dev/api.json` (~3.5MB, no auth, CORS *, ETag). Keyed
  provider→models; per-model `reasoning_options` incl.
  `{type:"effort", values:[...]}`, `limit`, `cost`. No per-provider endpoint —
  fetch whole file, index client-side. Map claude-code→anthropic, codex→openai,
  gemini-cli→google.

## Key files

- `src/constants/acp-providers.ts` — registry, `resolveEffectiveAcpModel` (:48),
  `getAcpPreferredDefaultModel` (:324, ALWAYS route defaults through this),
  `ACP_MANAGED_SENTINEL`, "default" is a real model id (claude adapter ≥0.44),
  `buildAcpAgentSettingsDiff` (:484).
- `src/routes/agent-settings.tsx` — profile editor; model dropdown :729.
- `src/components/features/chat/components/chat-input-model.tsx` +
  `src/hooks/use-chat-input-model-state.ts` — in-chat pill (the mid-session seat).
- `src/hooks/mutation/use-switch-acp-model.ts` — switch orchestrator; template for
  effort/mode switching. Writes must hit BOTH launch paths (profile + legacy
  agent_settings) or they silently diverge.
- `src/components/features/settings/agent-profiles/merge-agent-profile-save-input.ts`
  — whole-profile merge; new fields must survive it.
- `src/api/agent-server-adapter.ts` — wire payloads (`buildConfiguredAcpAgentSettings`
  :735); env vars only reach the agent via secrets-named-as-env-vars.
- `src/hooks/use-acp-model-context.ts`, `resolve-picker-kind.ts` — picker gating.
- Tests to keep green/extend: `__tests__/constants/acp-providers.test.ts`,
  `__tests__/hooks/mutation/use-switch-acp-model.test.tsx`,
  `__tests__/hooks/use-chat-input-model-state.test.tsx`,
  `src/api/agent-server-adapter.test.ts`, `tests/e2e/mock-llm/**` (mock server
  `tests/e2e/mock-llm/scripts/mock-acp-server.py` implements only
  initialize/new_session/prompt — extend for set_model/configOptions),
  `tests/e2e/live-acp/harness.mts`.

## Phase B (server side) — fork is ALREADY CLONED locally

`~/go/src/github.com/ryanskidmore/software-agent-sdk` (fork of
`OpenHands/software-agent-sdk`; contains `openhands-agent-server/`,
`openhands-sdk/`). Use a matching `feat/acp-native-models` branch there, same
commit discipline. Point Canvas dev at the local fork (`scripts/dev-safe.mjs`
uvx source override). Scope (M0 spike confirms how much is needed): forward ACP
configOptions/availableModels into ConversationInfo; endpoint for
`session/set_config_option` (thought_level); profile schema fields (models
list / effort); revisit the `acp<0.11` pin if config options need a newer lib.
Keep Canvas degrading gracefully against stock servers. Log upstream-worthy
items in `UPSTREAM_NOTES.md` (both repos).

## Gotchas

- Gemini defaults must stay vertex-safe (`gemini-2.5-pro`); gemini-cli ≥0.43
  errors on `set_session_mode("yolo")` headless (see live-acp harness).
- `buildAcpAgentSettingsDiff` always sends `acp_args: []` deliberately.
- Cloud org members are hidden from home-page model picks
  (`canPersistHomeAcpModel`).
- models.dev fetch: cache + TTL + fallback to static registry; never block render.
