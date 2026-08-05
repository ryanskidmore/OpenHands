import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AcpModelContext } from "#/hooks/use-acp-model-context";
import { getAcpProvider, type ACPModelOption } from "#/constants/acp-providers";
import { fetchModelsDevCatalog } from "#/api/models-dev-catalog";
import type { AcpModelChoice } from "#/hooks/use-acp-model-choices";
import { useAcpCustomModelsStore } from "#/stores/acp-custom-models-store";

vi.mock("#/api/models-dev-catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/api/models-dev-catalog")>();
  return {
    ...actual,
    fetchModelsDevCatalog: vi.fn(),
  };
});

// Matches useAcpModelChoices' merge shape for a curated-only list (no live
// session models, no remembered custom entries, no models.dev catalog data)
// — the exact composition every pre-M3 test in this file exercises.
function curatedChoices(options: ACPModelOption[] = []): AcpModelChoice[] {
  return options.map((option) => ({
    ...option,
    source: "curated",
  }));
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

const useActiveConversationMock = vi.fn();
const useSettingsMock = vi.fn();
const useActiveBackendMock = vi.fn();
const useAcpModelContextMock = vi.fn();
const useOptionalConversationIdMock = vi.fn();

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock("#/contexts/active-backend-context", async () => {
  const actual = await vi.importActual<
    typeof import("#/contexts/active-backend-context")
  >("#/contexts/active-backend-context");
  return {
    ...actual,
    useActiveBackend: () => useActiveBackendMock(),
  };
});

vi.mock("#/hooks/use-acp-model-context", () => ({
  useAcpModelContext: () => useAcpModelContextMock(),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => useOptionalConversationIdMock(),
}));

// The detail query and the org-permission check need a QueryClient this
// wrapper-less harness doesn't provide; both are driven per test (detail null
// → the settings fallback the older tests exercise).
const useActiveAcpProfileDetailMock = vi.fn();
vi.mock("#/hooks/query/use-active-acp-profile-detail", () => ({
  useActiveAcpProfileDetail: () => useActiveAcpProfileDetailMock(),
}));

const useCanManageOrgProfilesMock = vi.fn();
vi.mock("#/hooks/use-can-manage-org-profiles", () => ({
  useCanManageOrgProfiles: () => useCanManageOrgProfilesMock(),
}));

// `getAcpProvider`/`labelForAcpModel`/`resolveEffectiveAcpModel` are exercised
// for real (not mocked) so the test pins the actual registry-sourced model
// list the picker shows.
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";

// `useAcpModelContext` derives these booleans; here we drive them directly so
// each branch of `useChatInputModelState` is documented in isolation.
const acpContext = (
  overrides: Partial<AcpModelContext> = {},
): AcpModelContext => ({
  isActiveAcpConversation: false,
  isHomeAcp: false,
  isAcpContext: false,
  destinationPath: "/settings/llm",
  destinationLabel: "LLM Profiles",
  ...overrides,
});

describe("useChatInputModelState", () => {
  beforeEach(() => {
    useActiveConversationMock.mockReset();
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReset();
    useSettingsMock.mockReturnValue({ data: undefined });
    useActiveBackendMock.mockReset();
    // Default to a local backend — live ACP switching is local-only.
    useActiveBackendMock.mockReturnValue({ backend: { kind: "local" } });
    useAcpModelContextMock.mockReset();
    useAcpModelContextMock.mockReturnValue(acpContext());
    useOptionalConversationIdMock.mockReset();
    useOptionalConversationIdMock.mockReturnValue({ conversationId: null });
    useActiveAcpProfileDetailMock.mockReset();
    useActiveAcpProfileDetailMock.mockReturnValue(null);
    useCanManageOrgProfilesMock.mockReset();
    useCanManageOrgProfilesMock.mockReturnValue(true);
    // Never resolves by default: catalogStatus stays "loading" so
    // availableAcpModels stays curated(+live/custom)-only without every test
    // needing `waitFor` — matches what these tests actually want to pin.
    // Tests exercising catalog behavior specifically override this.
    vi.mocked(fetchModelsDevCatalog).mockReset();
    vi.mocked(fetchModelsDevCatalog).mockReturnValue(new Promise(() => {}));
    useAcpCustomModelsStore.setState({ customModelsByProfileId: {} });
  });

  it("non-ACP: shows the conversation/settings llm_model with no picker", () => {
    useActiveConversationMock.mockReturnValue({
      data: { conversation_id: "c1", llm_model: "openai/gpt-4o" },
    });
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAcpContext).toBe(false);
    expect(result.current.currentModelId).toBe("openai/gpt-4o");
    expect(result.current.displayModel).toBe("openai/gpt-4o");
    expect(result.current.availableAcpModels).toEqual([]);
    expect(result.current.showAcpPicker).toBe(false);
    // switchConversationId is ACP-only — null for native conversations.
    expect(result.current.switchConversationId).toBeNull();
    expect(result.current.destinationPath).toBe("/settings/llm");
  });

  it("non-ACP: falls back to settings.llm_model when the conversation has none", () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({ data: { llm_model: "openai/gpt-4o" } });

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.currentModelId).toBe("openai/gpt-4o");
  });

  it("active ACP: resolves the provider's available models (getAcpProvider called for active contexts, not just home)", () => {
    // Regression guard: in the old ChatInputModel `getAcpProvider` ran only on
    // the home branch. The shared hook calls it for ANY ACP context so the
    // picker has a model list on active conversations too. Pin that contract.
    const provider = getAcpProvider("claude-code");
    expect(provider?.available_models?.length).toBeGreaterThan(0);

    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "c1",
        agent_kind: "acp",
        acp_server: "claude-code",
        llm_model: "sonnet",
      },
    });
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });
    useAcpModelContextMock.mockReturnValue(
      acpContext({
        isActiveAcpConversation: true,
        isAcpContext: true,
        destinationPath: "/settings/agents",
        destinationLabel: "Agent",
      }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAcpContext).toBe(true);
    expect(result.current.currentModelId).toBe("sonnet");
    // Human label resolved from the registry (matches the conversation chip).
    expect(result.current.displayModel).toBe("Claude Sonnet 4.6");
    expect(result.current.availableAcpModels).toEqual(
      curatedChoices(provider?.available_models),
    );
    // Local backend + ACP + a non-empty model list → picker is enabled.
    expect(result.current.showAcpPicker).toBe(true);
    // Live switch targets the navigation conversation id.
    expect(result.current.switchConversationId).toBe("c1");
    expect(result.current.destinationPath).toBe("/settings/agents");
    // No composite suffix on this session id → base equals the id itself.
    expect(result.current.currentModelBaseId).toBe("sonnet");
  });

  it("home ACP: resolves the configured acp_model and exposes the picker, but no live-switch target", () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: {
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_model: "claude-sonnet-4-6",
        },
      },
    });
    useOptionalConversationIdMock.mockReturnValue({ conversationId: null });
    useAcpModelContextMock.mockReturnValue(
      acpContext({
        isHomeAcp: true,
        isAcpContext: true,
        destinationPath: "/settings/agents",
        destinationLabel: "Agent",
      }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.currentModelId).toBe("claude-sonnet-4-6");
    expect(result.current.showAcpPicker).toBe(true);
    // Home / no session → there is no conversation to switch in place.
    expect(result.current.switchConversationId).toBeNull();
  });

  it("home ACP: falls back to the provider default when no acp_model is saved", () => {
    const provider = getAcpProvider("claude-code");
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
      },
    });
    useAcpModelContextMock.mockReturnValue(
      acpContext({ isHomeAcp: true, isAcpContext: true }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.currentModelId).toBe(provider?.default_model);
  });

  it("home ACP: the active profile's detail overrides stale agent settings for provider and model", () => {
    // Activation is pointer-only: settings still describe claude-code, but the
    // active ACP profile is codex — the picker must follow the profile (the
    // conversation launch source), not the settings.
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: {
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_model: "claude-sonnet-4-6",
        },
      },
    });
    useActiveAcpProfileDetailMock.mockReturnValue({
      id: "id-codex",
      name: "codex-test",
      agent_kind: "acp",
      acp_server: "codex",
      acp_model: "gpt-5.5",
    });
    useAcpModelContextMock.mockReturnValue(
      acpContext({ isHomeAcp: true, isAcpContext: true }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.currentModelId).toBe("gpt-5.5");
    expect(result.current.availableAcpModels).toEqual(
      curatedChoices(getAcpProvider("codex")?.available_models),
    );
  });

  it("home ACP on cloud: hides the selectable rows from members who cannot manage org profiles", () => {
    // A home pick persists into the org-owned profile; a member's pick would
    // only 403. The chip and settings link remain (showAcpPicker false).
    useActiveBackendMock.mockReturnValue({ backend: { kind: "cloud" } });
    useCanManageOrgProfilesMock.mockReturnValue(false);
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
      },
    });
    useAcpModelContextMock.mockReturnValue(
      acpContext({ isHomeAcp: true, isAcpContext: true }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.availableAcpModels.length).toBeGreaterThan(0);
    expect(result.current.showAcpPicker).toBe(false);
  });

  it("showAcpPicker: cloud backend shows the picker when a model list is present (cloud ACP supports mid-conversation switching)", () => {
    useActiveBackendMock.mockReturnValue({ backend: { kind: "cloud" } });
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "c1",
        agent_kind: "acp",
        acp_server: "claude-code",
        llm_model: "claude-sonnet-4-6",
      },
    });
    useAcpModelContextMock.mockReturnValue(
      acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.availableAcpModels.length).toBeGreaterThan(0);
    // ACP + model list present → picker is enabled on all backends
    // (cloud ACP conversations support mid-conversation model switching).
    expect(result.current.showAcpPicker).toBe(true);
  });

  it("showAcpPicker tri-condition: an unknown ACP provider has no model list → no picker", () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "c1",
        agent_kind: "acp",
        acp_server: "some-custom-server",
        llm_model: "custom-model",
      },
    });
    useAcpModelContextMock.mockReturnValue(
      acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
    );

    const { result } = renderHook(() => useChatInputModelState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.availableAcpModels).toEqual([]);
    expect(result.current.showAcpPicker).toBe(false);
    // Unknown model id has no registry label → falls back to the raw id.
    expect(result.current.displayModel).toBe("custom-model");
  });

  describe("M3: live session models", () => {
    it("live models take precedence and appear ahead of the curated list", () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          conversation_id: "c1",
          agent_kind: "acp",
          acp_server: "claude-code",
          llm_model: "sonnet",
          acp_live_models: [{ id: "live-only", label: "Live Only Model" }],
        },
      });
      useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      const provider = getAcpProvider("claude-code");
      expect(result.current.availableAcpModels).toEqual([
        { id: "live-only", label: "Live Only Model", source: "live" },
        ...curatedChoices(provider?.available_models),
      ]);
      expect(result.current.showAcpPicker).toBe(true);
    });

    it("does not read live models outside an active ACP conversation (home page has no session)", () => {
      useActiveConversationMock.mockReturnValue({ data: undefined });
      useSettingsMock.mockReturnValue({
        data: {
          agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
        },
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isHomeAcp: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.availableAcpModels).toEqual(
        curatedChoices(getAcpProvider("claude-code")?.available_models),
      );
    });

    it("custom server: shows the picker once the live session reports models, even with no curated list", () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          conversation_id: "c1",
          agent_kind: "acp",
          acp_server: "custom",
          llm_model: "my-model",
          acp_live_models: [{ id: "my-model", label: "my-model" }],
        },
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.availableAcpModels).toEqual([
        { id: "my-model", label: "my-model", source: "live" },
      ]);
      expect(result.current.showAcpPicker).toBe(true);
    });

    it("custom server: stays hidden with no curated list, no live models, and no remembered custom entries", () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          conversation_id: "c1",
          agent_kind: "acp",
          acp_server: "custom",
          llm_model: "my-model",
        },
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.availableAcpModels).toEqual([]);
      expect(result.current.showAcpPicker).toBe(false);
    });

    it("custom server: shows the picker once a custom model is remembered for the active home profile", () => {
      useAcpCustomModelsStore
        .getState()
        .addCustomModel("profile-custom-1", "remembered-model");
      useActiveConversationMock.mockReturnValue({ data: undefined });
      useSettingsMock.mockReturnValue({
        data: { agent_settings: { agent_kind: "acp", acp_server: "custom" } },
      });
      useActiveAcpProfileDetailMock.mockReturnValue({
        id: "profile-custom-1",
        name: "custom-test",
        agent_kind: "acp",
        acp_server: "custom",
        acp_model: "remembered-model",
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isHomeAcp: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.availableAcpModels).toEqual([
        { id: "remembered-model", label: "remembered-model", source: "custom" },
      ]);
      expect(result.current.showAcpPicker).toBe(true);
    });

    it("composite current id ('<base>/<effort>') highlights via currentModelBaseId, not the raw id", () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          conversation_id: "c1",
          agent_kind: "acp",
          acp_server: "claude-code",
          llm_model: "sonnet/high",
        },
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.currentModelId).toBe("sonnet/high");
      // The composite id itself never appears among the choices (curated
      // ids are all bare)...
      expect(
        result.current.availableAcpModels.some(
          (choice) => choice.id === "sonnet/high",
        ),
      ).toBe(false);
      // ...but its parsed base does, so the picker can still mark it current.
      expect(result.current.currentModelBaseId).toBe("sonnet");
      expect(
        result.current.availableAcpModels.some(
          (choice) => choice.id === "sonnet",
        ),
      ).toBe(true);
    });

    it("leaves currentModelBaseId equal to currentModelId for a non-composite id (gemini-cli never splits)", () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          conversation_id: "c1",
          agent_kind: "acp",
          acp_server: "gemini-cli",
          llm_model: "gemini-2.5-pro/high",
        },
      });
      useAcpModelContextMock.mockReturnValue(
        acpContext({ isActiveAcpConversation: true, isAcpContext: true }),
      );

      const { result } = renderHook(() => useChatInputModelState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.currentModelId).toBe("gemini-2.5-pro/high");
      expect(result.current.currentModelBaseId).toBe("gemini-2.5-pro/high");
    });
  });
});
