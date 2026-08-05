# ACP Native Models — Progress

Goal: native multi-model + effort UX for ACP agents across the
`ryanskidmore/OpenHands` (Agent Canvas) and `ryanskidmore/software-agent-sdk`
forks. Full context: `.claude/plans/acp-native-models.md` (research, file map,
gotchas, workflow). Resume protocol: read that file + this one + `git log` in
both repos.

Workflow: integration branch `feat/acp-native-models` (both repos). Chunks on
`acp-models/mN-<slug>` branches, PR'd with base `feat/acp-native-models` on the
fork. Never touch `main`; never self-merge PRs — Ryan reviews/merges.

## Milestones

- [ ] **M0 spikes + scaffolding** (branch `acp-models/m0-spikes`)
  - [x] Integration branches created + pushed (both repos)
  - [x] Plan + PROGRESS.md committed
  - [x] Spike: what claude-agent-acp advertises (configOptions/models/effort)
  - [x] Spike: what the stock agent-server consumes/forwards (SDK repo map)
  - [x] Spike: Canvas-side persistence options + verified dev commands
  - [x] Findings recorded below; Phase B scope decided
  - [x] PR opened — ryanskidmore/OpenHands#1
- [x] **M1** models.dev catalog service (fetch/cache/provider-map/merge + tests)
      — `src/api/models-dev-catalog.ts`, `src/hooks/query/use-models-dev-
      catalog.ts` (+ 33 tests). PR: stacked on M0.
- [x] **M2** multi-model profile editing in settings — dynamic dropdown via
      `use-acp-model-choices` (live>curated>custom>models.dev precedence),
      per-profile remembered custom entries (`acp-custom-models-store`).
      Note: `pruneMissingProfiles` store action exists but is not yet wired
      to a call site (follow-up in M3/M6). Known pre-existing flake:
      `__tests__/scripts/dev-with-automation.test.ts` SIGHUP test fails in
      this sandbox, unrelated to this work.
- [ ] **M3** dynamic chat pill incl. custom-server picker
- [ ] **M4** effort foundation: encode/parse utility + capability flags + settings UI
- [ ] **M5** mid-session model+effort switcher
- [ ] **M6** hardening: mock ACP server extensions, docs, full suites green
- [ ] **Phase B (SDK fork)** — revised scope in "Phase B scope" below
  - [x] B1 claude effort splitter — ryanskidmore/software-agent-sdk#1
        (446 SDK ACP tests pass; current_model_id keeps composite)
  - [ ] B2 effort in ConversationInfo (in progress, stacked on B1)
  - [ ] B3 grouped selects + config_option_update refresh (nice-to-have)
  - [ ] dev-safe.mjs/uvx pointed at local fork (needed before live testing)

## Verified dev commands

Canvas (`ryanskidmore/OpenHands`; Node >=22.12, `npm ci`, lockfile =
package-lock.json):
- If `src/i18n/declaration.ts` missing: `npm run make-i18n` first.
- Typecheck `npm run typecheck` · lint `npm run lint` (superset: typecheck +
  eslint + prettier) · autofix `npm run lint:fix`.
- Unit: `npm test` (vitest; tests in `__tests__/` + co-located `*.test.ts(x)`).
  Scoped: `npm test -- <path>` or `npx vitest run <path>` / `-t "<name>"`.
- Mock-LLM e2e: `npm run test:e2e:mock-llm` (playwright.mock-llm.config.ts;
  scoped: `npx playwright test --config=playwright.mock-llm.config.ts
  tests/e2e/mock-llm/settings`). Prereqs: `npx playwright install chromium`,
  python3, prebuilt `npm run build:app`.
- Pre-commit husky hook runs lint-staged (eslint --fix, prettier, staged
  typecheck, translation completeness) — commits can rewrite files/fail on
  type errors; unit suite NOT run on commit.

software-agent-sdk (uv >=0.8.13): setup `make build`; tests `uv run pytest`
(targeted: `uv run pytest tests/sdk/agent/test_acp_agent.py`, `-k <expr>`);
lint `make lint` / `make format`; per-file gate `uv run pre-commit run --files
<path>` (pyright+ruff; NEVER mypy); OpenAPI gate `make test-server-schema`.

### Canvas persistence + capability gating (spike, 2026-08-05)

Per-profile UI state without server fields — ranked options, all with in-repo
precedent (key by profile UUID `id`, survives rename):
1. localStorage sidecar record keyed by entity id —
   `src/api/conversation-metadata-store.ts` (its `active_profile` is already
   a documented "client-side only because server schema won't take it" field).
2. Zustand persist store `Record<id,T>` — `src/stores/pinned-conversations-
   store.ts` (incl. prune-on-delete reaper); playbook comment in
   `src/stores/conversation-panel-preferences-store.ts:9-21`.
3. Server-side free-form: `misc_settings.app_preferences` (agent-server ≥1.27,
   deep-merged, closed field list mirroring SDK `AppPreferences` pydantic
   model) — needs an SDK-side field addition, which Phase B makes cheap;
   AGENTS.md rule: don't split one concern across localStorage AND server.
Validate on read (localStorage is user-writable) — `health-storage.ts:24-59`.

Capability gating precedents (for "needs forked/newer server" features):
- Min-version floor: `src/api/agent-server-compatibility.ts` (floor from
  `config/defaults.json` compatibility.minimumAgentServer).
- Advertised list w/ permissive default: `isAgentServerToolAvailable`
  (`usable_tools` from /server_info; unknown ⇒ allowed).
- Per-feature soft gate via `isAgentServerVersionError` (skip queries, stop
  retries, i18n fallback) — closest model for our forwarded-configOptions
  feature: `use-resolved-workspaces.ts:58,76-80`.
- Tri-state true/false/"unknown": `src/manifests/manifest-capabilities.ts`.
- Absent-field tolerance: `SettingsApiResponse.misc_settings` optional
  ("earlier servers omit the field entirely → defaults").

## M0 findings

### Adapter (claude-agent-acp) — verified by live stdio probe, 2026-08-05

`@agentclientprotocol/claude-agent-acp@0.64.2` (deps: `@agentclientprotocol/sdk@1.3.0`,
`@anthropic-ai/claude-agent-sdk@0.3.220`).

- `initialize` carries NO model info. Everything lives in `session/new` →
  `configOptions[]`:
  - `id:"model"`, category `"model"`, type select. Values observed live:
    `default`, `opus[1m]`, `claude-fable-5[1m]`, `sonnet`, `haiku` — each with
    display `name` + `description`. List comes from the Claude Agent SDK's
    `initializationResult.models` (NOT hardcoded), filtered by a
    `settings.json` `availableModels` allowlist / `CLAUDE_MODEL_CONFIG` env.
  - `id:"effort"`, category `"thought_level"`, type select. Values: `default`
    + the model's `supportedEffortLevels` (`low|medium|high|xhigh|max`); only
    present when the current model `supportsEffort`. Applied internally via
    `applyFlagSettings({effortLevel})`.
  - also `id:"mode"` (permission modes), `id:"fast"` (category `model_config`,
    boolean), `id:"agent"` (custom subagents).
- **`session/set_model` does not exist** in adapter 0.64.2 or
  `@agentclientprotocol/sdk` 1.3.0 — only `session/set_mode` and
  `session/set_config_option` are registered. Model switch =
  `set_config_option {configId:"model"}` → SDK `query.setModel()`.
- Implication: Claude model AND effort switching ride the same
  `session/set_config_option` surface; server-side must speak it (Phase B
  question: what does the stock agent-server call today?).
- Effort ≠ thinking budget: `MAX_THINKING_TOKENS` env maps separately to the
  SDK `thinking` option; effort is its own flag.
- Probe artifacts: `~/.claude/jobs/0541901a/tmp/adapter-spike/` (probe.js,
  logs, installed package for reference).

### SDK / agent-server (spike, 2026-08-05; software-agent-sdk @ 4f3032f2)

The ACP client is `openhands-sdk/openhands/sdk/agent/acp_agent.py` (~4160
lines). Corrections to earlier assumptions — the stock stack does MORE than
Canvas uses:

- `_extract_session_models` (:473) already parses `configOptions` with
  `id=="model"` (preferred) or the removed unstable `models` block (fallback)
  → `ConversationInfo.available_models: list[ACPModelInfo{model_id,name,
  description}]`, `current_model_id`, `supports_runtime_model_switch`
  (agent_server/models.py:261,276,295), persisted in agent_state and lifted by
  `_compose_conversation_info` (conversation_service.py:399). **Canvas simply
  never reads `available_models` → live model lists are Phase A work.**
- `switch_acp_model` (route conversation_router.py:553 → local_conversation
  .py:1665 → `_apply_acp_model` acp_agent.py:441) uses `set_config_option`
  when advertised (`via_config_option`), falling back to legacy
  `set_session_model`. Compatible with claude adapter 0.64.2. Persist-only
  deferral for pre-first-run conversations confirmed (returns 200).
- Effort seam: `_codex_model_config_options` (acp_agent.py:395) already splits
  Codex `model/effort` composites into TWO config options (`model` +
  `reasoning_effort`, efforts {low,medium,high,xhigh}); gated to codex only by
  `_model_config_options` (:406). Claude effort = extend this splitter for
  claude-code with configId `effort` (+ `max` level). Rides ALL existing
  plumbing incl. profile persist + deferral + switch endpoint.
- Schema reality: `AgentProfileBase` is `extra="forbid"` (agent_profile.py:86)
  but `ACPAgentSettings` is `extra="ignore"` (no ConfigDict). Additive
  `ConversationInfo` fields / new REST routes are explicitly non-breaking
  (openhands-agent-server/AGENTS.md REST policy; oasdiff CI); incompatible
  changes need 5-minor-release deprecation runway.
- acp lib: constraint `>=0.10.1`, lock resolves 0.10.1. acp 0.12 REMOVED
  `set_session_model` from ClientSideConnection → bumping breaks the fallback
  branch (acp_agent.py:464). Stay on 0.10.1 unless that branch is reworked.
- Known extractor gaps: grouped selects yield empty model lists (silently);
  `category` never read; `ConfigOptionUpdate`/`CurrentModeUpdate`
  notifications ignored (no mid-session refresh); the codex
  `reasoning_effort` option's advertised values are never surfaced.
- SDK pins spawned CLIs: claude-agent-acp 0.44.0, codex-acp 1.1.2, gemini-cli
  0.46.0 (acp_providers.py:381). Registry lists are curated tuples
  (`ACPModelOption{id,label}` — no effort/metadata fields).
- New SDK settings fields touch: settings/model.py (ACPAgentSettings),
  profiles/agent_profile.py (ACPAgentProfile), profiles/resolver.py
  (`_build_acp_settings`), persisted-settings baselines (tests/sdk/
  persisted_settings_baselines/), weak-schema allowlist for dict-typed fields.

### Phase B scope (decided from spikes)

- B1 (small, high value): extend `_model_config_options` to split
  `model/effort` for claude-code → configId `effort`; accept `max`; tests
  mirroring codex ones. Unblocks Claude effort end-to-end via existing
  `switch_acp_model` + `acp_model` persistence (composite string convention,
  same as Codex today).
- B2 (additive): surface effort in `ConversationInfo` — extract the
  `effort`/`reasoning_effort` config option (current + available values) in
  `_extract_session_models`; new optional fields `current_effort`,
  `available_efforts`. Non-breaking per REST policy.
- B3 (nice-to-have): handle grouped selects; handle `config_option_update`
  notifications to refresh model/effort state mid-session.
- NOT needed in Phase B: forwarding available models (already exists);
  set_config_option endpoint for model (switch_acp_model suffices).

## Log

- 2026-08-05: Research done (3 agents: Canvas map, Claude Code ACP, ACP spec +
  models.dev). Goal set. Integration branches pushed in both repos. M0 spikes
  launched (adapter probe, SDK map, Canvas persistence).
- 2026-08-05: All 3 spikes done, findings above. Big wins: server already
  forwards available_models (live lists = Phase A); switch uses
  set_config_option; Claude effort = small SDK splitter change (B1). npm ci
  done. Next: M0 PR, then M1 models.dev catalog service.
