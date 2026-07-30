/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { GuidPageSkeleton } from '@renderer/pages/guid/components/GuidSkeleton';
import { ConversationPageSkeleton } from '@renderer/pages/conversation/components/ConversationSkeleton';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import {
  getAgentHubDefaultSettingsPath,
  isAgentHubAgentsSettingsHidden,
  isAgentHubPetSettingsHidden,
  isAgentHubToolsSettingsHidden,
} from '@renderer/utils/hub/agentHubUiPolicy';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AgentRepairPage = React.lazy(() => import('@renderer/pages/settings/AgentSettings/AgentRepairPage'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const SkillsSettings = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillsHubSettings'));
const SkillDetailPage = React.lazy(() => import('@renderer/pages/settings/SkillsSettings/SkillDetailPage'));
const ToolsSettings = React.lazy(() => import('@renderer/pages/settings/ToolsSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));

const withRouteFallback = (
  Component: React.LazyExoticComponent<React.ComponentType>,
  fallback: React.ReactNode = <AppLoader />
) => (
  <Suspense fallback={fallback}>
    <Component />
  </Suspense>
);

/**
 * Legacy `/settings/capabilities?tab=tools` deep links now map to the standalone
 * Tools page; everything else (skills tab or no tab) lands on the Skills page.
 */
const CapabilitiesRedirect: React.FC = () => {
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'tools' && !isAgentHubToolsSettingsHidden()) {
    return <Navigate to='/settings/tools' replace />;
  }
  return <Navigate to='/settings/skills' replace />;
};

// No login gate: the Hub is always authenticated (device SN is the sole identity,
// see AuthContext). This wrapper only injects the shared layout.
const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => React.cloneElement(layout);

const DEFAULT_SETTINGS_PATH = getAgentHubDefaultSettingsPath();
const AGENTS_SETTINGS_HIDDEN = isAgentHubAgentsSettingsHidden();
const TOOLS_SETTINGS_HIDDEN = isAgentHubToolsSettingsHidden();
const PET_SETTINGS_HIDDEN = isAgentHubPetSettingsHidden();

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => (
  <HashRouter>
    <Routes>
      <Route element={<ProtectedLayout layout={layout} />}>
        <Route path='/' element={<Navigate to='/guid' replace />} />
        <Route path='/guid' element={withRouteFallback(Guid, <GuidPageSkeleton />)} />
        <Route
          path='/conversation/:id'
          element={withRouteFallback(Conversation, <ConversationPageSkeleton />)}
        />
        <Route
          path='/team/:id'
          element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
        />
        <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
        <Route path='/assistants' element={withRouteFallback(AssistantSettings)} />
        {/* Assistants moved out of Settings to a top-level entry; keep a redirect
            so old deep links / back-nav still land on the new page. */}
        <Route path='/settings/assistants' element={<Navigate to='/assistants' replace />} />
        {AGENTS_SETTINGS_HIDDEN ? (
          <>
            <Route path='/settings/agent' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
            <Route path='/settings/agent/:id/repair' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
          </>
        ) : (
          <>
            <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
            <Route path='/settings/agent/:id/repair' element={withRouteFallback(AgentRepairPage)} />
          </>
        )}
        {/* Skills and Tools are top-level settings entries. */}
        <Route path='/settings/skills' element={withRouteFallback(SkillsSettings)} />
        <Route path='/settings/skills/import-history' element={withRouteFallback(SkillsSettings)} />
        <Route path='/settings/skills/detail/:skillName' element={withRouteFallback(SkillDetailPage)} />
        {TOOLS_SETTINGS_HIDDEN ? (
          <Route path='/settings/tools' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
        ) : (
          <Route path='/settings/tools' element={withRouteFallback(ToolsSettings)} />
        )}
        {/* Legacy routes — the previous combined "Capabilities" page is now two pages. */}
        <Route path='/settings/capabilities' element={<CapabilitiesRedirect />} />        <Route
          path='/settings/capabilities/skills/import-history'
          element={<Navigate to='/settings/skills/import-history' replace />}
        />
        <Route path='/settings/skills-hub' element={<Navigate to='/settings/skills' replace />} />
        {/* Agent Hub: Appearance removed — redirect legacy deep links. */}
        <Route path='/settings/appearance' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
        <Route path='/settings/display' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
        <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
        {PET_SETTINGS_HIDDEN ? (
          <Route path='/settings/pet' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
        ) : (
          <Route path='/settings/pet' element={withRouteFallback(PetSettings)} />
        )}
        <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
        <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
        <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
        <Route path='/settings' element={<Navigate to={DEFAULT_SETTINGS_PATH} replace />} />
        <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
        <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
        <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
      </Route>
      {/* Legacy /login route — no login flow anymore; redirect into the app. */}
      <Route path='/login' element={<Navigate to='/guid' replace />} />
      <Route path='*' element={<Navigate to='/guid' replace />} />
    </Routes>
  </HashRouter>
);

export default PanelRoute;
