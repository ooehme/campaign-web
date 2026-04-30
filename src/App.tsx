import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { CampaignListPage } from './pages/CampaignListPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { CampaignTaskListPage } from './pages/CampaignTaskListPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { AreasPage } from './pages/AreasPage'
import { TeamsPage } from './pages/TeamsPage'
import { UsersPage } from './pages/UsersPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { UserEditPage } from './pages/UserEditPage'
import { TeamDetailPage } from './pages/TeamDetailPage'
import { TeamEditPage } from './pages/TeamEditPage'
import { LoginPage } from './pages/LoginPage'
import { AreaCreateMapPage } from './pages/AreaCreateMapPage'
import { AreaDetailPage } from './pages/AreaDetailPage'
import { AreaEditPage } from './pages/AreaEditPage'
import { RequireAuth } from './auth/RequireAuth'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/campaigns" element={<CampaignListPage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/areas/new-map" element={<AreaCreateMapPage />} />
          <Route path="/areas/:areaId" element={<AreaDetailPage />} />
          <Route path="/areas/:areaId/edit" element={<AreaEditPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />
          <Route path="/teams/:teamId/edit" element={<TeamEditPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
          <Route path="/users/:userId/edit" element={<UserEditPage />} />
          <Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} />
          <Route path="/campaigns/:campaignId/tasks" element={<CampaignTaskListPage />} />
          <Route path="/campaigns/:campaignId/areas/new-map" element={<AreaCreateMapPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/tasks/:taskId/edit" element={<TaskDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
