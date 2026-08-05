import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import {
  type AcpModelContext,
  useAcpModelContext,
} from "#/hooks/use-acp-model-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCanManageOrgProfiles } from "#/hooks/use-can-manage-org-profiles";
import { useActiveAcpProfileDetail } from "#/hooks/query/use-active-acp-profile-detail";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import {
  getAcpPreferredDefaultModel,
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
} from "#/constants/acp-providers";
import {
  useAcpModelChoices,
  type AcpModelChoice,
} from "#/hooks/use-acp-model-choices";
import { parseAcpModelId } from "#/utils/acp-model-id";

export interface ChatInputModelState {
  isAcpContext: boolean;
  displayModel: string | null;
  currentModelId: string | null;
  /**
   * `currentModelId`'s base model (see {@link parseAcpModelId}) — identical
   * to `currentModelId` unless it's a composite "<base>/<effort>" session
   * id, in which case this is the bare base. The picker uses this as a
   * fallback match so a composite id (e.g. "sonnet/high") still highlights
   * its bare "sonnet" row (M4/M5 own actually offering effort rows).
   */
  currentModelBaseId: string | null;
  availableAcpModels: AcpModelChoice[];
  showAcpPicker: boolean;
  switchConversationId: string | null;
  destinationPath: AcpModelContext["destinationPath"];
  destinationLabel: string;
}

export function useChatInputModelState(): ChatInputModelState {
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { conversationId } = useOptionalConversationId();
  const { backend } = useActiveBackend();
  const canManageOrgProfiles = useCanManageOrgProfiles();
  // The active ACP AgentProfile's own fields are the conversation launch
  // source (activation never writes agent_settings, so the global settings
  // may describe a different provider). Null in a conversation, while
  // loading, when the active profile isn't ACP, or on legacy backends
  // without the profiles surface — settings are the fallback in that window.
  const activeAcpProfile = useActiveAcpProfileDetail();
  const {
    isActiveAcpConversation,
    isHomeAcp,
    isAcpContext,
    destinationPath,
    destinationLabel,
  } = useAcpModelContext();

  const settingsAcpServerKey =
    typeof settings?.agent_settings?.acp_server === "string"
      ? settings.agent_settings.acp_server
      : null;
  const acpServerKey = isActiveAcpConversation
    ? conversation?.acp_server
    : isHomeAcp
      ? (activeAcpProfile?.acp_server ?? settingsAcpServerKey)
      : null;
  const acpProvider = isAcpContext ? getAcpProvider(acpServerKey) : undefined;

  const settingsAcpModel =
    typeof settings?.agent_settings?.acp_model === "string"
      ? settings.agent_settings.acp_model
      : null;
  // Home: read the model from the same source as the server key — mixing the
  // profile's provider with a stale settings model could pair e.g. a codex
  // provider with a claude model.
  const acpConfiguredModel =
    isHomeAcp && activeAcpProfile
      ? activeAcpProfile.acp_model
      : settingsAcpModel;

  let currentModelId: string | null = null;
  if (isActiveAcpConversation) {
    // ACP conversations store llm_model as the acp_model (persisted at
    // creation time). Use it directly if available; fall back to the
    // settings-configured model or provider default so the chip stays visible.
    currentModelId =
      conversation?.llm_model ??
      resolveEffectiveAcpModel({
        configured: acpConfiguredModel,
        providerDefault: getAcpPreferredDefaultModel(acpServerKey),
      });
  } else if (isHomeAcp) {
    currentModelId = resolveEffectiveAcpModel({
      configured: acpConfiguredModel,
      // Preferred default (Vertex-safe for Gemini) — must match what the
      // start request would substitute for an unconfigured model.
      providerDefault: getAcpPreferredDefaultModel(acpServerKey),
    });
  } else {
    currentModelId = conversation?.llm_model ?? settings?.llm_model ?? null;
  }

  const displayModel =
    currentModelId && isAcpContext
      ? (labelForAcpModel(acpServerKey, currentModelId) ?? currentModelId)
      : currentModelId;

  // The active AgentProfile's stable UUID, used to key the "remembered
  // custom model" store (see useAcpCustomModelsStore / useAcpModelChoices).
  // On the home page this is the active profile fetched above; in a
  // conversation it's the profile the conversation itself launched from.
  // A conversation started off legacy `agent_settings` (no profile) has
  // none — `undefined` there means "no custom entries offered/rememberable",
  // matching useAcpModelChoices' documented pre-M2 behavior for an unknown
  // profile id.
  const profileId = isActiveAcpConversation
    ? (conversation?.launched_agent_profile?.agent_profile_id ?? undefined)
    : isHomeAcp
      ? (activeAcpProfile?.id ?? undefined)
      : undefined;

  // Live models the ACP session itself currently reports — only meaningful
  // inside an active ACP conversation (the home page has no running
  // session); `undefined` there, and also on an agent-server too old to
  // surface ConversationInfo.available_models. See AppConversation.acp_live_models.
  const liveModels = isActiveAcpConversation
    ? conversation?.acp_live_models
    : undefined;

  const { choices: availableAcpModels } = useAcpModelChoices({
    acpServer: acpServerKey,
    curated: acpProvider?.available_models ?? [],
    profileId,
    liveModels,
    // Skip the models.dev catalog fetch outside an ACP context — this hook
    // still runs on every chat render (Rules of Hooks), including plain
    // OpenHands conversations that will never show the picker.
    enabled: isAcpContext,
  });

  const currentModelBaseId = currentModelId
    ? parseAcpModelId(currentModelId, acpServerKey).base
    : null;

  // A home-page pick persists into the active ACP profile, which on cloud is
  // org-owned — hide the selectable rows from members who'd only get a 403.
  // Conversation-scoped switches (blank or started) stay member-allowed.
  const canPersistHomeAcpModel =
    !isHomeAcp || backend.kind !== "cloud" || canManageOrgProfiles;
  const showAcpPicker =
    isAcpContext && availableAcpModels.length > 0 && canPersistHomeAcpModel;
  const switchConversationId = isActiveAcpConversation
    ? (conversationId ?? null)
    : null;

  return {
    isAcpContext,
    displayModel,
    currentModelId,
    currentModelBaseId,
    availableAcpModels,
    showAcpPicker,
    switchConversationId,
    destinationPath,
    destinationLabel,
  };
}
