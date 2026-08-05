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
  - [ ] Spike: what claude-agent-acp advertises (configOptions/models/effort)
  - [ ] Spike: what the stock agent-server consumes/forwards (SDK repo map)
  - [ ] Spike: Canvas-side persistence options + verified dev commands
  - [ ] Findings recorded below; Phase B scope decided; PR opened
- [ ] **M1** models.dev catalog service (fetch/cache/provider-map/merge + tests)
- [ ] **M2** multi-model profile editing in settings
- [ ] **M3** dynamic chat pill incl. custom-server picker
- [ ] **M4** effort foundation: encode/parse utility + capability flags + settings UI
- [ ] **M5** mid-session model+effort switcher
- [ ] **M6** hardening: mock ACP server extensions, docs, full suites green
- [ ] **Phase B (SDK fork)** scope from M0: forward configOptions →
      ConversationInfo; set_config_option (thought_level) endpoint; profile
      schema (models list/effort); dev-safe.mjs/uvx pointed at local fork;
      acp<0.11 pin revisited

## Verified dev commands

(to be filled by M0 spike — typecheck/lint/unit/scoped-unit/e2e for Canvas;
pytest/lint for software-agent-sdk)

## M0 findings

(pending spike reports)

## Log

- 2026-08-05: Research done (3 agents: Canvas map, Claude Code ACP, ACP spec +
  models.dev). Goal set. Integration branches pushed in both repos. M0 spikes
  launched (adapter probe, SDK map, Canvas persistence).
