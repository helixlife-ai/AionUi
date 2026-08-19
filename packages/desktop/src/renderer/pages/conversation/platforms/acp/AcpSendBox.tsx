import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IMessageText } from '@/common/chat/chatLib';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import { parseError, uuid } from '@/common/utils';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
  useAttachEntry,
} from '@/renderer/components/chat/MobileActionSheet';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { classifyConfigSetError, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import {
  useAddOrUpdateMessage,
  useMessageList,
  useUpdateMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import {
  isAgentHubPermissionSelectorHidden,
  isAgentHubModelSelectorHidden,
} from '@/renderer/utils/hub/agentHubUiPolicy';
import { normalizeCodexSessionMode } from '@/renderer/utils/hub/normalizeCodexSessionMode';
import { preparePdfAttachmentsForSend } from '@/renderer/utils/hub/pdfAttachments/preparePdfAttachmentsForSend';
import { getChatSurfaceWidthClass } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { Message, Tag } from '@arco-design/web-react';
import { Brain, MagicHat, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { classifyConversationBusyError } from '../conversationBusyError';
import { buildSendFailureError } from './buildSendFailureError';
import { useAcpInitialMessage } from './useAcpInitialMessage';
import type { UseAcpMessageReturn } from './useAcpMessage';
import {
  findPendingAcpSend,
  readPendingAcpSends,
  removePendingAcpSend,
  upsertPendingAcpSend,
  type PendingAcpSend,
} from './pendingAcpSend';

const SEND_ACK_CONFIRMING_DELAY_MS = 30_000;
const RECOVERED_SEND_MATCH_WINDOW_MS = 5 * 60_000;

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  workspacePath?: string;
  messageState: UseAcpMessageReturn;
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
}> = ({
  conversation_id,
  backend,
  session_mode,
  agent_name,
  workspacePath,
  messageState,
  teamSendMessage,
  teamRuntime,
}) => {
  const { aiProcessing, setAiProcessing, resetState, hasThinkingMessage, slashCommands } = messageState;
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  // In team mode, all agents show the permission mode selector (members don't propagate)
  const showModeSelector = !isAgentHubPermissionSelectorHidden();
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const conversationContext = useConversationContextSafe();
  const loadedSkills = conversationContext?.loadedSkills ?? [];
  const loadedMcpStatuses =
    conversationContext?.loadedMcpStatuses ??
    (conversationContext?.loadedMcpServers ?? []).map<IConversationMcpStatus>((name) => ({
      id: name,
      name,
      status: 'loaded',
    }));
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const prepareRuntimeConfig = useCallback(async () => {
    if (teamPermission) return;
  }, [teamPermission]);
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareRuntime: prepareRuntimeConfig,
    prepareSetRuntime: teamPermission?.warmupSession,
    loadConfigOptions: teamPermission?.loadConfigOptions,
    enabled: true,
  });
  const runtimeMode = runtimeConfig.mode;
  const runtimeThoughtLevel = runtimeConfig.thoughtLevel;
  const handleThoughtLevelSetOption = useCallback(
    async (optionId: string, value: string) => runtimeConfig.setConfigOption(optionId, value),
    [runtimeConfig]
  );

  // Drive the mobile sheet's model entry off the same source AcpModelSelector uses
  const {
    model_info,
    canSwitch: canSwitchModel,
    selectModel,
  } = useAcpModelInfo({
    conversation_id,
    backend,
    prepareRuntime: prepareRuntimeConfig,
    prepareSetRuntime: teamPermission?.warmupSession,
    loadConfigOptions: teamPermission?.loadConfigOptions,
    enabled: isMobile,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: (_modelId, error) => Message.error(t(configErrorMessageKey(error))),
  });
  useEffect(() => {
    if (!runtimeMode?.currentValue) return;
    setCurrentMode(runtimeMode.currentValue);
  }, [runtimeMode?.currentValue]);

  const handleSheetModeChange = useCallback(
    async (mode: string) => {
      if (!runtimeMode || mode === runtimeMode.currentValue) return;
      try {
        await runtimeConfig.setConfigOption(runtimeMode.id, normalizeCodexSessionMode(mode));
        setCurrentMode(normalizeCodexSessionMode(mode));
        if (isLeaderInTeam) teamPermission?.propagateMode?.(normalizeCodexSessionMode(mode));
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AcpSendBox] Failed to switch mode via sheet:', error);
        Message.error(t(configErrorMessageKey(error)));
      }
    },
    [isLeaderInTeam, runtimeConfig, runtimeMode, t, teamPermission]
  );

  const handleContentChange = useCallback(
    (val: string) => {
      setContent(val);
    },
    [setContent]
  );
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const messageList = useMessageList();
  const updateMessageList = useUpdateMessageList();
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const updateMessageListRef = useLatestRef(updateMessageList);
  const optimisticAttemptRef = React.useRef(new Map<string, string>());
  const activeOptimisticSendIdsRef = React.useRef(new Set<string>());
  const runtimeView = useConversationRuntimeView(conversation_id);
  const { markSendStarted, markSendAccepted, markSendFailed } = runtimeView;

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const commandQueueRuntimeGate = teamRuntime?.runtimeGate ?? {
    hydrated: runtimeView.hydrated,
    canSendMessage: runtimeView.canSendMessage,
    isProcessing: runtimeView.isProcessing,
  };
  const isCancelling = runtimeView.state === 'cancelling';
  const isBusy = isCancelling || commandQueueRuntimeGate.isProcessing || !commandQueueRuntimeGate.canSendMessage;

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
      const new_content = content ? `${content}\n${text}` : text;
      setContentRef.current(new_content);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to append text to sendbox
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      const prev = contentRef.current;
      setContentRef.current(prev ? `${prev}${text}` : text);
    },
    []
  );

  // Check for and send initial message from guid page
  useAcpInitialMessage({
    conversation_id: conversation_id,
    backend,
    workspacePath,
    setAiProcessing,
    resetState,
    markSendStarted,
    markSendAccepted,
    markSendFailed,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const setOptimisticMessageStatus = useCallback(
    (messageId: string, status: 'pending' | 'work' | 'error') => {
      updateMessageListRef.current((list) =>
        list.map((message) =>
          message.msg_id === messageId || message.id === messageId ? { ...message, status } : message
        )
      );
      const pending = findPendingAcpSend(conversation_id, messageId);
      if (pending) upsertPendingAcpSend({ ...pending, status });
    },
    [conversation_id]
  );

  const acknowledgeOptimisticMessage = useCallback(
    (messageId: string, backendMessageId: string) => {
      updateMessageListRef.current((list) => {
        const next = list.filter(
          (message) => message.msg_id !== backendMessageId || message.msg_id === messageId || message.id === messageId
        );
        const optimisticIndex = next.findIndex((message) => message.msg_id === messageId || message.id === messageId);
        if (optimisticIndex === -1) return list;
        next[optimisticIndex] = {
          ...next[optimisticIndex],
          id: backendMessageId,
          msg_id: backendMessageId,
          status: 'finish',
        };
        return next;
      });
      removePendingAcpSend(conversation_id, messageId);
    },
    [conversation_id]
  );

  useEffect(() => {
    const pendingSends = readPendingAcpSends(conversation_id);
    if (pendingSends.length === 0) return;
    const recoveredSends = pendingSends.map((item) => ({
      ...item,
      status: item.status === 'error' ? ('error' as const) : ('work' as const),
    }));
    recoveredSends.forEach(upsertPendingAcpSend);
    updateMessageListRef.current((list) => {
      const next = list.slice();
      recoveredSends.forEach((item) => {
        const existingIndex = next.findIndex((message) => (message.msg_id || message.id) === item.id);
        if (existingIndex >= 0) {
          next[existingIndex] = { ...next[existingIndex], status: item.status };
          return;
        }
        next.push({
          id: item.id,
          msg_id: item.id,
          conversation_id,
          type: 'text',
          position: 'right',
          status: item.status,
          created_at: item.createdAt,
          content: { content: item.displayMessage },
        } satisfies IMessageText);
      });
      return next;
    });
  }, [conversation_id]);

  useEffect(() => {
    const pendingSends = readPendingAcpSends(conversation_id);
    if (pendingSends.length === 0) return;
    const acknowledgedLocalIds = pendingSends
      .filter((pending) => pending.status !== 'error')
      .filter((pending) =>
        messageList.some(
          (message) =>
            message.type === 'text' &&
            message.position === 'right' &&
            message.msg_id !== pending.id &&
            message.content.content === pending.displayMessage &&
            (message.created_at ?? 0) >= pending.createdAt &&
            (message.created_at ?? 0) <= pending.createdAt + RECOVERED_SEND_MATCH_WINDOW_MS
        )
      )
      .map((pending) => pending.id);
    if (acknowledgedLocalIds.length === 0) return;
    const acknowledgedSet = new Set(acknowledgedLocalIds);
    acknowledgedLocalIds.forEach((id) => removePendingAcpSend(conversation_id, id));
    updateMessageListRef.current((list) =>
      list.filter((message) => !acknowledgedSet.has(message.msg_id || message.id))
    );
  }, [conversation_id, messageList]);

  const executeCommand = useCallback(
    async (
      { input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>,
      options?: { optimisticMessageId?: string; isCurrentAttempt?: () => boolean }
    ) => {
      const sendFiles = await preparePdfAttachmentsForSend(files, { backend });
      const displayMessage = buildDisplayMessage(input, sendFiles, workspacePath || '');

      try {
        if (teamPermission) await teamPermission.warmupSession();
        void checkAndUpdateTitle(conversation_id, input);
        if (teamSendMessage) {
          await teamSendMessage({ input: displayMessage, files: sendFiles });
          emitter.emit('chat.history.refresh');
          if (sendFiles.length > 0) {
            emitter.emit('acp.workspace.refresh');
          }
          return;
        }

        markSendStarted();
        setAiProcessing(true);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files: sendFiles,
        });
        markSendAccepted(result.turn_id, result.runtime, result.msg_id);
        if (options?.optimisticMessageId) {
          acknowledgeOptimisticMessage(options.optimisticMessageId, result.msg_id);
        }
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        if (options?.isCurrentAttempt && !options.isCurrentAttempt()) {
          throw error;
        }
        const errorMsg =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        const safeErrorMsg = typeof errorMsg === 'string' ? errorMsg : String(errorMsg ?? '');
        const busyError = classifyConversationBusyError(error);
        if (busyError) {
          markSendFailed({
            kind: 'busy_conflict',
            reason: safeErrorMsg,
            busyKind: busyError.kind,
            status: busyError.status,
            code: busyError.code,
          });
          throw error;
        }

        markSendFailed({ kind: 'ordinary', reason: safeErrorMsg });

        // Archived conversation (e.g. legacy Gemini). Backend signals this
        // via HTTP 410 + code='CONVERSATION_ARCHIVED' — identified by code,
        // not by substring matching.
        if (isBackendHttpError(error) && error.code === 'CONVERSATION_ARCHIVED') {
          Message.error({
            content: error.backendMessage || safeErrorMsg,
            duration: 6000,
          });
          setAiProcessing(false);
          throw error;
        }

        const isAuthError =
          safeErrorMsg.includes('[ACP-AUTH-') ||
          safeErrorMsg.includes('authentication failed') ||
          safeErrorMsg.includes('认证失败');
        if (!options?.optimisticMessageId) {
          if (isAuthError) {
            const errorMessage = {
              id: uuid(),
              msg_id: uuid(),
              turn_id: '',
              conversation_id,
              type: 'error',
              data: t('acp.auth.failed', {
                backend,
                error: safeErrorMsg,
                defaultValue: `${backend} authentication failed:

{{error}}

Please check your local CLI tool authentication status`,
              }),
            };

            ipcBridge.acpConversation.responseStream.emit(errorMessage);
          } else {
            addOrUpdateMessageRef.current(
              {
                id: uuid(),
                msg_id: uuid(),
                type: 'tips',
                position: 'center',
                conversation_id,
                created_at: Date.now(),
                content: {
                  content: safeErrorMsg,
                  type: 'error',
                  error: buildSendFailureError(error, safeErrorMsg),
                },
              },
              true
            );
          }
        }

        resetState();
        setAiProcessing(false);
        throw error;
      }

      if (sendFiles.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [
      backend,
      acknowledgeOptimisticMessage,
      checkAndUpdateTitle,
      conversation_id,
      markSendAccepted,
      markSendFailed,
      markSendStarted,
      resetState,
      setAiProcessing,
      t,
      teamPermission,
      teamSendMessage,
      workspacePath,
    ]
  );

  const sendOptimisticMessage = useCallback(
    async (item: PendingAcpSend) => {
      const attemptId = uuid();
      optimisticAttemptRef.current.set(item.id, attemptId);
      activeOptimisticSendIdsRef.current.add(item.id);
      upsertPendingAcpSend({ ...item, status: 'pending' });
      setOptimisticMessageStatus(item.id, 'pending');

      const timeout = window.setTimeout(() => {
        if (optimisticAttemptRef.current.get(item.id) !== attemptId) return;
        setOptimisticMessageStatus(item.id, 'work');
      }, SEND_ACK_CONFIRMING_DELAY_MS);

      try {
        await executeCommand(item, {
          optimisticMessageId: item.id,
          isCurrentAttempt: () => optimisticAttemptRef.current.get(item.id) === attemptId,
        });
      } catch {
        if (optimisticAttemptRef.current.get(item.id) === attemptId) {
          setOptimisticMessageStatus(item.id, 'error');
        }
      } finally {
        window.clearTimeout(timeout);
        if (optimisticAttemptRef.current.get(item.id) === attemptId) {
          activeOptimisticSendIdsRef.current.delete(item.id);
          optimisticAttemptRef.current.delete(item.id);
        }
      }
    },
    [executeCommand, setOptimisticMessageStatus]
  );

  useAddEventListener(
    'conversation.message.retry',
    ({ conversation_id: retryConversationId, message_id }) => {
      if (retryConversationId !== conversation_id || activeOptimisticSendIdsRef.current.has(message_id)) return;
      const pending = findPendingAcpSend(conversation_id, message_id);
      if (pending?.status !== 'error') return;
      void sendOptimisticMessage({ ...pending, status: 'pending' });
    },
    [conversation_id, sendOptimisticMessage]
  );

  const {
    items: queuedCommands,
    mode: queueMode,
    isInteractionLocked: isQueueInteractionLocked,
    executingCommandId,
    hasPendingCommands,
    enqueue,
    remove,
    prioritize,
    clear,
    reorder,
    toggleMode,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    enabled: true,
    isBusy,
    runtimeGate: commandQueueRuntimeGate,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path));
    const allFiles = [...uploadFile, ...atPathFiles];

    clearFiles();
    emitter.emit('acp.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy: isBusy || activeOptimisticSendIdsRef.current.size > 0,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: allFiles });
      return;
    }

    if (!teamSendMessage) {
      const id = uuid();
      const optimisticSend: PendingAcpSend = {
        id,
        conversation_id,
        input: message,
        files: allFiles,
        displayMessage: buildDisplayMessage(message, allFiles, workspacePath || ''),
        createdAt: Date.now(),
        status: 'pending',
      };
      upsertPendingAcpSend(optimisticSend);
      updateMessageListRef.current((list) => [
        ...list,
        {
          id,
          msg_id: id,
          conversation_id,
          type: 'text',
          position: 'right',
          status: 'pending',
          created_at: optimisticSend.createdAt,
          content: { content: optimisticSend.displayMessage },
        },
      ]);
      await sendOptimisticMessage(optimisticSend);
      return;
    }

    await executeCommand({ input: message, files: allFiles });
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('acp.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const { entries: attachEntries, hiddenFileInput: attachHiddenInput } = useAttachEntry({
    openFileSelector,
    onLocalFilesAdded: handleFilesAdded,
  });

  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const availableModes =
      runtimeMode?.options.map((item) => ({
        value: item.value,
        label: item.label,
        description: item.description ?? undefined,
      })) ?? [];
    const modeOptions: MobileActionSheetOption[] = availableModes.map((mode) => ({
      key: mode.value,
      label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
      description: mode.description,
      active: (runtimeMode?.currentValue ?? currentMode) === mode.value,
    }));

    const modelOptions: MobileActionSheetOption[] = canSwitchModel
      ? (model_info?.available_models ?? []).map((model) => ({
          key: model.id,
          label: model.label || model.id,
          description: model.description,
          active: model_info?.current_model_id === model.id,
        }))
      : [];

    const currentModelLabel =
      model_info?.current_model_label || model_info?.current_model_id || t('conversation.welcome.useCliModel');
    const currentModeLabel =
      modeOptions.find((opt) => opt.active)?.label ?? t('agentMode.default', { defaultValue: 'Default' });

    const entries: MobileActionSheetEntry[] = [];

    // Model entry: only when the agent exposes a switchable list. Otherwise
    // (Codex with no list, no info) skip — exposing a no-op row would be noise.
    if (!isAgentHubModelSelectorHidden() && modelOptions.length > 0) {
      entries.push({
        key: 'model',
        icon: <Brain theme='outline' size='16' />,
        label: t('common.model', { defaultValue: 'Model' }),
        meta: currentModelLabel,
        submenu: {
          title: t('common.model', { defaultValue: 'Model' }),
          options: modelOptions,
          onSelect: (id) => selectModel(id),
        },
      });
    }

    if (runtimeThoughtLevel) {
      entries.push({
        key: 'thought-level',
        icon: <Brain theme='outline' size='16' />,
        label: t('agent.thoughtLevel.label'),
        meta:
          runtimeThoughtLevel.options.find((item) => item.value === runtimeThoughtLevel.currentValue)?.label ||
          runtimeThoughtLevel.currentValue ||
          '',
        submenu: {
          title: t('agent.thoughtLevel.label'),
          options: runtimeThoughtLevel.options.map((item) => ({
            key: item.value,
            label: item.label,
            description: item.description ?? undefined,
            active: runtimeThoughtLevel.currentValue === item.value,
          })),
          onSelect: (value) => {
            void handleThoughtLevelSetOption(runtimeThoughtLevel.id, value)
              .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
              .catch((error) => Message.error(t(configErrorMessageKey(error))));
          },
        },
      });
    }

    if (!isAgentHubPermissionSelectorHidden() && modeOptions.length > 0) {
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: currentModeLabel,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
          onSelect: (key) => void handleSheetModeChange(key),
        },
      });
    }

    attachEntries.forEach((entry, idx) => {
      entries.push({
        ...entry,
        dividerBefore: idx === 0 ? entries.length > 0 : false,
      });
    });

    if (loadedSkills.length > 0) {
      const skillOptions: MobileActionSheetOption[] = loadedSkills.map((name) => ({
        key: name,
        label: `/${name}`,
      }));
      entries.push({
        key: 'skills',
        icon: <MagicHat theme='outline' size='16' />,
        label: t('common.selectedSkills', { defaultValue: 'Selected skills' }),
        variant: 'muted',
        submenu: {
          title: t('common.selectedSkills', { defaultValue: 'Selected skills' }),
          selectable: false,
          options: skillOptions,
          onSelect: (name) => {
            setContent(`/${name} `);
          },
        },
      });
    }

    if (loadedMcpStatuses.length > 0) {
      const mcpOptions: MobileActionSheetOption[] = loadedMcpStatuses.map((item) => ({
        key: item.id,
        label: item.name,
        description:
          item.status === 'loaded'
            ? undefined
            : item.reason
              ? `${t(`conversation.mcp.status.${item.status}` as const)} · ${item.reason}`
              : t(`conversation.mcp.status.${item.status}` as const),
      }));
      entries.push({
        key: 'mcp',
        icon: <Shield theme='outline' size='16' />,
        label: t('conversation.mcp.selected', { defaultValue: 'Selected MCP' }),
        variant: 'muted',
        submenu: {
          title: t('conversation.mcp.selected', { defaultValue: 'Selected MCP' }),
          selectable: false,
          options: mcpOptions,
          onSelect: () => undefined,
        },
      });
    }

    return entries;
  }, [
    attachEntries,
    canSwitchModel,
    currentMode,
    handleSheetModeChange,
    handleThoughtLevelSetOption,
    isMobile,
    loadedMcpStatuses,
    loadedSkills,
    model_info,
    runtimeMode,
    runtimeThoughtLevel,
    selectModel,
    setContent,
    t,
  ]);

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Cancelling is best-effort: swallow errors (e.g. backend WS not yet
    // connected → 409) so they don't bubble up as unhandled rejections.
    // UI state is still reset via finally.
    const turnId = runtimeView.activeTurnId;
    if (!turnId) {
      resetState();
      resetActiveExecution('stop');
      return;
    }
    runtimeView.markStopRequested(turnId);
    try {
      const result = await ipcBridge.conversation.stop.invoke({ conversation_id, turn_id: turnId });
      runtimeView.markStopAcknowledged(turnId, result.runtime);
    } catch (error) {
      console.warn('[AcpSendBox] stop request failed', error);
      runtimeView.resetLocalGate('stop_failed');
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };
  const effectiveHandleStop = teamRuntime?.onStop ?? handleStop;
  const handleSendNowQueued = useCallback(
    async (item: ConversationCommandQueueItem) => {
      // Stop the current reply (best-effort), then promote the chosen command
      // to the front of the queue in auto mode.  The drain effect will fire it
      // once the execution gate shows canExecute — avoiding the 409 race that
      // occurs when sendNow() calls onExecute() directly before the backend
      // has finished processing the stop.
      await effectiveHandleStop();
      prioritize(item.id);
    },
    [effectiveHandleStop, prioritize]
  );
  const sendBoxWidthClass = getChatSurfaceWidthClass(Boolean(teamPermission));

  return (
    <div className={`${sendBoxWidthClass} flex flex-col mt-auto mb-16px`}>
      <CommandQueuePanel
        items={queuedCommands}
        mode={queueMode}
        isMobile={isMobile}
        interactionLocked={isQueueInteractionLocked}
        executingCommandId={executingCommandId}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onSendNow={handleSendNowQueued}
        onToggleMode={toggleMode}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay
        running={teamRuntime?.loading ?? (aiProcessing && !hasThinkingMessage)}
        statusText={teamRuntime?.statusText}
        externalElapsedSource={Boolean(teamRuntime)}
        startedAtMs={teamRuntime?.startedAtMs ?? null}
        onStop={effectiveHandleStop}
        onRetryStart={teamRuntime?.onRetryStart ? () => void teamRuntime.onRetryStart?.() : undefined}
      />

      <SendBox
        onMobilePlusClick={isMobile ? () => setIsMobileSheetOpen(true) : undefined}
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items);
          setAtPath(items);
        }}
        loading={teamRuntime?.loading ?? isBusy}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', {
          backend: agent_name || backend,
          defaultValue: `Send message to {{backend}}...`,
        })}
        onStop={effectiveHandleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={!isMobile}
        lockMultiLine={!isMobile}
        tools={
          <FileAttachButton
            openFileSelector={openFileSelector}
            onLocalFilesAdded={handleFilesAdded}
            loadedMcpStatuses={loadedMcpStatuses}
          />
        }
        rightTools={
          <div className='flex items-center gap-8px min-w-0'>
            {showModeSelector && (
              <AgentModeSelector
                backend={backend}
                conversation_id={conversation_id}
                compact
                initialMode={session_mode}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
                beforeRuntimeSync={prepareRuntimeConfig}
                beforeRuntimeSet={teamPermission?.warmupSession}
                loadConfigOptions={teamPermission?.loadConfigOptions}
              />
            )}
          </div>
        }
        prefix={
          <>
            {uploadFile.length > 0 && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
                ))}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('acp.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
        slash_commands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
        compactActions={false}
      ></SendBox>
      {isMobile && (
        <>
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('common.more', { defaultValue: 'More' })}
            entries={sheetEntries}
          />
          {attachHiddenInput}
        </>
      )}
    </div>
  );
};

export default AcpSendBox;
