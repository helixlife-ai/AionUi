/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import {
  getAgentHubDefaultSettingsPath,
  isAgentHubAgentsSettingsHidden,
  isAgentHubPetSettingsHidden,
} from '@renderer/utils/hub/agentHubUiPolicy';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AgentRepairPage = React.lazy(() => import('@renderer/pages/settings/AgentSettings/AgentRepairPage'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

// No login gate: the Hub is always authenticated (device SN is the sole identity,
// see AuthContext). This wrapper only injects the shared layout.
const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => React.cloneElement(layout);

const DEFAULT_SETTINGS_PATH = getAgentHubDefaultSettingsPath();
const AGENTS_SETTINGS_HIDDEN = isAgentHubAgentsSettingsHidden();
const PET_SETTINGS_HIDDEN = isAgentHubPetSettingsHidden();

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => (
  <HashRouter>
    <Routes>
      <Route element={<ProtectedLayout layout={layout} />}>
        <Route path='/' element={<Navigate to='/guid' replace />} />
        <Route path='/guid' element={withRouteFallback(Guid)} />
        <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
        <Route
          path='/team'
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
        <Route path='/settings/capabilities' element={withRouteFallback(CapabilitiesSettings)} />
        <Route path='/settings/capabilities/skills/import-history' element={withRouteFallback(CapabilitiesSettings)} />
        {/* Legacy routes — redirect to the merged /settings/capabilities page */}
        <Route path='/settings/skills-hub' element={<Navigate to='/settings/capabilities?tab=skills' replace />} />
        <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
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
