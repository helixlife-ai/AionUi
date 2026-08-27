/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMcpServer, IProvider, TProviderWithModel } from '@/common/config/storage';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import { DROPDOWN_SEARCH_THRESHOLD } from '@/renderer/components/agent/runtimeSelectorOptions';
import AionInlineSearchInput from '@/renderer/components/base/AionInlineSearchInput';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type {
  MobileActionSheetEntry,
  MobileActionSheetOption,
} from '@/renderer/components/chat/MobileActionSheet/types';
import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import type { AgentRuntimeDerivedOption } from '@/renderer/utils/model/agentRuntimeCatalog';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  getCleanFileNames,
  FileService,
  allSupportedExts,
  isSupportedFile,
  FILE_UNSUPPORTED_ERROR,
} from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { showFileAttachError, filterPathsWithinUploadLimit } from '@/renderer/utils/file/fileAttachErrors';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Checkbox, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Brain, FolderUpload, Lightning, Plus, Shield, UploadOne } from '@icon-park/react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAgentHubPermissionSelectorHidden } from '@/renderer/utils/hub/agentHubUiPolicy';
import styles from '../index.module.css';

/**
 * Shared shell for the skills / MCP submenu popups: an optional pinned search
 * box on top and a single scroll container below (`.dropdown-search-scroll`,
 * see arco-override.css), mirroring RuntimeSelectorModelList's layout so the
 * search box never scrolls away with the list.
 *
 * Keyboard/mouse events are isolated on the search box so Arco's hover Menu
 * cannot treat the second letter or a digit as a menu hotkey (which closes the
 * flyout). While the user is interacting with search we also force the SubMenu
 * popup to stay open, because filtering shrinks the list and Arco would
 * otherwise fire mouseLeave.
 *
 * Windows Chromium also moves focus onto `role="menuitem"` for typeahead and
 * fires mouseLeave when filtered items remount. Keep the input focused and
 * ignore that leave while searching.
 */
const SubmenuSearchList: React.FC<{
  showSearch: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  searchTestId: string;
  emptyText: string;
  isEmpty: boolean;
  searchInputRef?: React.Ref<HTMLInputElement>;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  children: React.ReactNode;
}> = ({
  showSearch,
  query,
  onQueryChange,
  placeholder,
  searchTestId,
  emptyText,
  isEmpty,
  searchInputRef,
  onSearchFocus,
  onSearchBlur,
  children,
}) => (
  <>
    {showSearch ? (
      <div
        className='px-6px pt-4px pb-6px'
        style={{ background: 'var(--color-bg-popup)' }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyPress={(event) => event.stopPropagation()}
      >
        <AionInlineSearchInput
          ref={searchInputRef}
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          autoFocus
          data-testid={searchTestId}
          inputProps={{
            onFocus: onSearchFocus,
            onBlur: onSearchBlur,
          }}
        />
      </div>
    ) : null}
    <div className='dropdown-search-scroll max-h-320px overflow-y-auto'>
      {isEmpty ? <div className='px-12px py-10px text-12px text-t-tertiary text-center'>{emptyText}</div> : children}
    </div>
  </>
);

const submenuSearchTriggerProps = (keepOpen: boolean) => ({
  popupStyle: { overflowX: 'hidden' as const },
  mouseLeaveDelay: keepOpen ? 800 : 300,
  blurToHide: false,
  ...(keepOpen ? { popupVisible: true } : {}),
});

const isFocusInsideSearchPopup = (input: HTMLInputElement | null): boolean => {
  const active = document.activeElement;
  if (!input || !(active instanceof Element)) return false;
  if (active === input) return true;
  const popup = input.closest('.arco-dropdown, .arco-trigger-popup, .arco-dropdown-menu');
  return !!popup?.contains(active);
};

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;

  // Model selector node (rendered by parent for the desktop layout)
  modelSelectorNode: React.ReactNode;

  // Flat model data for the mobile action sheet (desktop uses modelSelectorNode).
  isGeminiMode: boolean;
  modelList: IProvider[];
  current_model?: TProviderWithModel;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: (model: string | null) => void;

  // Thought level (mobile action sheet; only present for ACP agents)
  thoughtLevelOption?: AgentRuntimeDerivedOption | null;
  onThoughtLevelSelect?: (value: string) => void;

  // Agent mode
  modeBackend?: string;
  selectedMode: string;
  dynamicModes?: AgentModeOption[];
  onModeSelect: (mode: string) => void;

  // Skills management
  allSkills: Array<{ name: string; description: string; isAuto: boolean }>;
  disabledBuiltinSkills: string[];
  enabledSkills: string[];
  onToggleSkill: (name: string, isAuto: boolean) => void;
  mcpServers: IMcpServer[];
  selectedMcpServerIds: string[];
  onToggleMcpServer: (serverId: string) => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  modelSelectorNode,
  isGeminiMode,
  modelList,
  current_model,
  setCurrentModel,
  currentAcpCachedModelInfo,
  selectedAcpModel,
  setSelectedAcpModel,
  thoughtLevelOption,
  onThoughtLevelSelect,
  modeBackend,
  selectedMode,
  dynamicModes = [],
  onModeSelect,
  allSkills,
  disabledBuiltinSkills,
  enabledSkills,
  onToggleSkill,
  mcpServers,
  selectedMcpServerIds,
  onToggleMcpServer,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [mcpQuery, setMcpQuery] = useState('');
  const [skillSearchFocused, setSkillSearchFocused] = useState(false);
  const [mcpSearchFocused, setMcpSearchFocused] = useState(false);
  const skillSearchInputRef = useRef<HTMLInputElement>(null);
  const mcpSearchInputRef = useRef<HTMLInputElement>(null);
  const skillSearchActive = skillSearchFocused || skillQuery.length > 0;
  const mcpSearchActive = mcpSearchFocused || mcpQuery.length > 0;
  // Skills/MCP submenus render in a nested Arco portal. Clicks there look like
  // "outside" to the parent click-dropdown; remember them so we don't dismiss.
  const pointerInsidePlusMenuRef = useRef(false);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        pointerInsidePlusMenuRef.current = false;
        return;
      }
      const insidePopup = !!target.closest('.arco-dropdown, .arco-dropdown-menu, .arco-trigger, .arco-menu');
      const onPlusButton = !!target.closest('[data-testid="file-upload-btn"]');
      pointerInsidePlusMenuRef.current = insidePopup && !onPlusButton;
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  useLayoutEffect(() => {
    if (!skillSearchFocused) return;
    skillSearchInputRef.current?.focus({ preventScroll: true });
  }, [skillQuery, skillSearchFocused]);

  useLayoutEffect(() => {
    if (!mcpSearchFocused) return;
    mcpSearchInputRef.current?.focus({ preventScroll: true });
  }, [mcpQuery, mcpSearchFocused]);

  const restoreSearchFocusIfStillInPopup = useCallback(
    (inputRef: { current: HTMLInputElement | null }, setFocused: (value: boolean) => void) => {
      window.setTimeout(() => {
        const input = inputRef.current;
        if (isFocusInsideSearchPopup(input)) {
          input?.focus({ preventScroll: true });
          return;
        }
        setFocused(false);
      }, 0);
    },
    []
  );

  const handlePlusDropdownVisibleChange = useCallback((visible: boolean) => {
    if (
      !visible &&
      (pointerInsidePlusMenuRef.current ||
        document.activeElement === skillSearchInputRef.current ||
        document.activeElement === mcpSearchInputRef.current)
    ) {
      return;
    }
    setIsPlusDropdownOpen(visible);
    // Reopening the "+" menu should always show the full lists again.
    if (!visible) {
      setSkillQuery('');
      setMcpQuery('');
      setSkillSearchFocused(false);
      setMcpSearchFocused(false);
    }
  }, []);
  const showModeSwitch = !isAgentHubPermissionSelectorHidden() && dynamicModes.length > 0;
  const configOptionCount = (modelSelectorNode ? 1 : 0) + (showModeSwitch ? 1 : 0);

  // Browser file picker ref (WebUI only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList);
        if (processed.length > 0) {
          onFilesUploaded(processed.map((f) => f.path));
        }
      } catch (error) {
        showFileAttachError(t, error);
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onFilesUploaded, t]
  );

  const getModeDisplayLabel = (mode: AgentModeOption): string =>
    t(`agentMode.${mode.value}`, { defaultValue: mode.label });

  const isWebUI = !isElectronDesktop();

  const isSkillChecked = (skill: { name: string; isAuto: boolean }) =>
    skill.isAuto ? !disabledBuiltinSkills.includes(skill.name) : enabledSkills.includes(skill.name);

  const activeSkillCount = allSkills.filter(isSkillChecked).length;
  const activeMcpCount = selectedMcpServerIds.length;

  const skillKeyword = skillQuery.trim().toLowerCase();
  const filteredSkills = skillKeyword
    ? allSkills.filter((skill) => skill.name.toLowerCase().includes(skillKeyword))
    : allSkills;
  const mcpKeyword = mcpQuery.trim().toLowerCase();
  const filteredMcpServers = mcpKeyword
    ? mcpServers.filter((server) => server.name.toLowerCase().includes(mcpKeyword))
    : mcpServers;
  const showSkillSearch = allSkills.length > DROPDOWN_SEARCH_THRESHOLD;
  const showMcpSearch = mcpServers.length > DROPDOWN_SEARCH_THRESHOLD;

  const openHostFilePicker = useCallback(() => {
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then(async (uploadedFiles) => {
        if (!uploadedFiles || uploadedFiles.length === 0) return;
        const withinLimit = await filterPathsWithinUploadLimit(uploadedFiles, t);
        if (withinLimit.length > 0) onFilesUploaded(withinLimit);
      })
      .catch((error) => console.error('Failed to open file dialog:', error));
  }, [onFilesUploaded, t]);

  // Build the mobile action sheet entries: model / thought level / permission
  // (single-select), attach (action), skills / MCP (multi-select checkboxes).
  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];
    const entries: MobileActionSheetEntry[] = [];

    // Model — aionrs is provider-grouped, ACP is a flat cached list.
    let modelOptions: MobileActionSheetOption[] = [];
    let currentModelLabel = '';
    let onModelSelect: (key: string) => void = () => {};
    if (isGeminiMode) {
      const enabled = modelList.filter((p) => p.enabled !== false);
      modelOptions = enabled.flatMap((provider) =>
        getAvailableModels(provider).map((modelName) => ({
          key: `${provider.id}::${modelName}`,
          label: modelName,
          description: provider.name,
          active: current_model?.id === provider.id && current_model?.use_model === modelName,
        }))
      );
      currentModelLabel = current_model?.use_model || '';
      onModelSelect = (key) => {
        const [providerId, modelName] = key.split('::');
        const provider = enabled.find((p) => p.id === providerId);
        if (provider) void setCurrentModel({ ...provider, use_model: modelName } as TProviderWithModel);
      };
    } else {
      const available = currentAcpCachedModelInfo?.available_models ?? [];
      modelOptions = available.map((model) => ({
        key: model.id,
        label: model.label || model.id,
        description: model.description,
        active: model.id === selectedAcpModel,
      }));
      currentModelLabel =
        available.find((m) => m.id === selectedAcpModel)?.label || currentAcpCachedModelInfo?.current_model_label || '';
      onModelSelect = (key) => setSelectedAcpModel(key);
    }
    if (modelOptions.length > 0) {
      entries.push({
        key: 'model',
        icon: <Brain theme='outline' size='16' />,
        label: t('common.model', { defaultValue: 'Model' }),
        meta: currentModelLabel,
        submenu: {
          title: t('common.model', { defaultValue: 'Model' }),
          options: modelOptions,
          onSelect: onModelSelect,
        },
      });
    }

    // Thought level (ACP agents only).
    if (thoughtLevelOption && thoughtLevelOption.options.length > 0 && onThoughtLevelSelect) {
      const currentValue = thoughtLevelOption.currentValue;
      entries.push({
        key: 'thought-level',
        icon: <Brain theme='outline' size='16' />,
        label: t('agent.thoughtLevel.label'),
        meta: thoughtLevelOption.options.find((o) => o.value === currentValue)?.label || currentValue || '',
        submenu: {
          title: t('agent.thoughtLevel.label'),
          options: thoughtLevelOption.options.map((o) => ({
            key: o.value,
            label: o.label,
            description: o.description ?? undefined,
            active: o.value === currentValue,
          })),
          onSelect: (value) => onThoughtLevelSelect(value),
        },
      });
    }

    // Permission / agent mode.
    if (dynamicModes.length > 0) {
      const modeOptions: MobileActionSheetOption[] = dynamicModes.map((mode) => ({
        key: mode.value,
        label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
        description: mode.description,
        active: mode.value === selectedMode,
      }));
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: modeOptions.find((o) => o.active)?.label,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
          onSelect: onModeSelect,
        },
      });
    }

    // Attach files (action row; no submenu).
    entries.push({
      key: 'attach',
      icon: <FolderUpload theme='outline' size='16' />,
      label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
      variant: 'muted',
      dividerBefore: true,
      onClick: () => (isWebUI ? fileInputRef.current?.click() : openHostFilePicker()),
    });

    // Skills (multi-select).
    if (allSkills.length > 0) {
      entries.push({
        key: 'skills',
        icon: <Lightning theme='outline' size='16' />,
        label: t('settings.capabilitiesTab.skills'),
        variant: 'muted',
        meta:
          activeSkillCount > 0
            ? t('common.selectedCount', { count: activeSkillCount, defaultValue: `Selected ${activeSkillCount}` })
            : undefined,
        submenu: {
          title: t('settings.capabilitiesTab.skills'),
          multiSelect: true,
          options: allSkills.map((skill) => ({
            key: skill.name,
            label: skill.name,
            description: skill.description || undefined,
            active: isSkillChecked(skill),
          })),
          onSelect: (name) => {
            const skill = allSkills.find((s) => s.name === name);
            if (skill) onToggleSkill(skill.name, skill.isAuto);
          },
        },
      });
    }

    // MCP servers (multi-select).
    if (mcpServers.length > 0) {
      entries.push({
        key: 'mcp',
        icon: <Shield theme='outline' size='16' />,
        label: t('mcp.label'),
        variant: 'muted',
        meta:
          activeMcpCount > 0
            ? t('common.selectedCount', { count: activeMcpCount, defaultValue: `Selected ${activeMcpCount}` })
            : undefined,
        submenu: {
          title: t('mcp.label'),
          multiSelect: true,
          options: mcpServers.map((server) => ({
            key: server.id,
            label: server.name,
            description: server.tools?.length ? `${server.tools.length} ${t('mcp.tools')}` : undefined,
            active: selectedMcpServerIds.includes(server.id),
          })),
          onSelect: (id) => onToggleMcpServer(id),
        },
      });
    }

    return entries;
  }, [
    isMobile,
    isGeminiMode,
    modelList,
    current_model,
    setCurrentModel,
    currentAcpCachedModelInfo,
    selectedAcpModel,
    setSelectedAcpModel,
    thoughtLevelOption,
    onThoughtLevelSelect,
    dynamicModes,
    selectedMode,
    onModeSelect,
    allSkills,
    disabledBuiltinSkills,
    enabledSkills,
    onToggleSkill,
    mcpServers,
    selectedMcpServerIds,
    onToggleMcpServer,
    activeSkillCount,
    activeMcpCount,
    isWebUI,
    openHostFilePicker,
    t,
  ]);

  const menuContent = (
    <Menu
      className='min-w-200px'
      onClickMenuItem={(key) => {
        // Keep the "+" menu open while toggling skills / MCP (multi-select).
        if (key.startsWith('skill-') || key.startsWith('mcp-')) {
          return false;
        }
        if (key === 'file') {
          ipcBridge.dialog.showOpen
            .invoke({ properties: ['openFile', 'multiSelections'] })
            .then(async (uploadedFiles) => {
              if (!uploadedFiles || uploadedFiles.length === 0) return;
              const supported = uploadedFiles.filter((path) =>
                isSupportedFile(path.split(/[\\/]/).pop() || path, allSupportedExts)
              );
              if (supported.length < uploadedFiles.length) {
                showFileAttachError(t, new Error(FILE_UNSUPPORTED_ERROR));
              }
              if (supported.length === 0) return;
              const withinLimit = await filterPathsWithinUploadLimit(supported, t);
              if (withinLimit.length > 0) {
                onFilesUploaded(withinLimit);
              }
            })
            .catch((error) => {
              console.error('Failed to open file dialog:', error);
            });
        } else if (key === 'device') {
          fileInputRef.current?.click();
        }
      }}
    >
      {isWebUI ? (
        <>
          <Menu.Item key='file'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.addFiles')}</span>
            </div>
          </Menu.Item>
          <Menu.Item key='device'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.myDevice')}</span>
            </div>
          </Menu.Item>
        </>
      ) : (
        <Menu.Item key='file'>
          <div className='flex items-center gap-8px'>
            <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <span>{t('common.fileAttach.addFiles')}</span>
          </div>
        </Menu.Item>
      )}
      {allSkills.length > 0 && (
        <Menu.SubMenu
          key='skills'
          title={
            <div className='flex items-center gap-8px'>
              <Lightning theme='filled' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('settings.capabilitiesTab.skills')} ({activeSkillCount}/{allSkills.length})
              </span>
            </div>
          }
          triggerProps={submenuSearchTriggerProps(skillSearchActive)}
        >
          <SubmenuSearchList
            showSearch={showSkillSearch}
            query={skillQuery}
            onQueryChange={setSkillQuery}
            placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
            searchTestId='guid-skill-search'
            emptyText={t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills.' })}
            isEmpty={filteredSkills.length === 0}
            searchInputRef={skillSearchInputRef}
            onSearchFocus={() => setSkillSearchFocused(true)}
            onSearchBlur={() => restoreSearchFocusIfStillInPopup(skillSearchInputRef, setSkillSearchFocused)}
          >
            {filteredSkills.map((skill) => (
              <Menu.Item
                key={`skill-${skill.name}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSkill(skill.name, skill.isAuto);
                }}
              >
                <Checkbox
                  checked={isSkillChecked(skill)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onChange={() => onToggleSkill(skill.name, skill.isAuto)}
                >
                  <span className='text-13px'>{skill.name}</span>
                </Checkbox>
              </Menu.Item>
            ))}
          </SubmenuSearchList>
        </Menu.SubMenu>
      )}
      {mcpServers.length > 0 && (
        <Menu.SubMenu
          key='mcp'
          title={
            <div className='flex items-center gap-8px'>
              <Shield theme='outline' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('mcp.label')} ({activeMcpCount}/{mcpServers.length})
              </span>
            </div>
          }
          triggerProps={submenuSearchTriggerProps(mcpSearchActive)}
        >
          <SubmenuSearchList
            showSearch={showMcpSearch}
            query={mcpQuery}
            onQueryChange={setMcpQuery}
            placeholder={t('mcp.searchServers', { defaultValue: 'Search servers...' })}
            searchTestId='guid-mcp-search'
            emptyText={t('mcp.noServersFound', { defaultValue: 'No servers found matching your criteria' })}
            isEmpty={filteredMcpServers.length === 0}
            searchInputRef={mcpSearchInputRef}
            onSearchFocus={() => setMcpSearchFocused(true)}
            onSearchBlur={() => restoreSearchFocusIfStillInPopup(mcpSearchInputRef, setMcpSearchFocused)}
          >
            {filteredMcpServers.map((server) => (
              <Menu.Item
                key={`mcp-${server.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMcpServer(server.id);
                }}
              >
                <Checkbox
                  checked={selectedMcpServerIds.includes(server.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onChange={() => onToggleMcpServer(server.id)}
                >
                  <span className='text-13px'>
                    {server.name}
                    {server.tools?.length ? ` (${server.tools.length} ${t('mcp.tools')})` : ''}
                  </span>
                </Checkbox>
              </Menu.Item>
            ))}
          </SubmenuSearchList>
        </Menu.SubMenu>
      )}
    </Menu>
  );

  return (
    <div className={styles.actionRow}>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          {isMobile ? (
            // Mobile: the "+" opens the bottom action sheet holding every control.
            <span className='flex items-center gap-4px lh-[1]'>
              <Button
                type='secondary'
                shape='circle'
                icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                loading={uploading}
                disabled={uploading}
                data-testid='file-upload-btn'
                onClick={() => setIsSheetOpen(true)}
              />
              {files.length > 0 && (
                <Tooltip
                  className={'!max-w-max'}
                  content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                >
                  <span className='text-t-primary'>File({files.length})</span>
                </Tooltip>
              )}
            </span>
          ) : (
            <Dropdown
              trigger='click'
              popupVisible={isPlusDropdownOpen}
              onVisibleChange={handlePlusDropdownVisibleChange}
              droplist={menuContent}
            >
              <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
                <Button
                  type='secondary'
                  shape='circle'
                  className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
                  icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                  loading={uploading}
                  disabled={uploading}
                  data-testid='file-upload-btn'
                />
                {files.length > 0 && (
                  <Tooltip
                    className={'!max-w-max'}
                    content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                  >
                    <span className='text-t-primary'>File({files.length})</span>
                  </Tooltip>
                )}
              </span>
            </Dropdown>
          )}
          {isWebUI && (
            <input
              ref={fileInputRef}
              type='file'
              multiple
              style={{ display: 'none' }}
              onChange={handleLocalFileChange}
            />
          )}
        </div>
      </div>
      {isMobile && (
        <MobileActionSheet
          open={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title={t('common.more')}
          entries={sheetEntries}
        />
      )}
      <div className={styles.actionSubmit}>
        {/* Desktop keeps the inline model/permission selectors; on mobile they move into the sheet. */}
        {!isMobile && configOptionCount > 0 && (
          <div className={styles.actionConfigGroup} data-mobile={isMobile ? 'true' : undefined}>
            {modelSelectorNode}

            {showModeSwitch && (
              <AgentModeSelector
                backend={modeBackend}
                compact
                initialMode={selectedMode}
                onModeSelect={onModeSelect}
                dynamicModes={dynamicModes}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={getModeDisplayLabel}
              />
            )}
          </div>
        )}

        {speechInputNode}
        <Button
          shape='circle'
          type='primary'
          loading={loading}
          disabled={isButtonDisabled}
          className='send-button-custom'
          style={{
            backgroundColor: isButtonDisabled ? undefined : '#000000',
            borderColor: isButtonDisabled ? undefined : '#000000',
          }}
          icon={<ArrowUp theme='filled' size='14' fill='white' strokeWidth={5} />}
          onClick={onSend}
          data-testid='guid-send-btn'
        />
      </div>
    </div>
  );
};

export default GuidActionRow;
