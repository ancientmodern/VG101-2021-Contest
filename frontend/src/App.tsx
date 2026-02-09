import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MatchDetailPage } from './pages/MatchDetailPage';
import { MatchListPage } from './pages/MatchListPage';
import { ProfilePage } from './pages/ProfilePage';
import { RulesPage } from './pages/RulesPage';
import { ScoreboardPage } from './pages/ScoreboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubmissionDetailPage } from './pages/SubmissionDetailPage';
import { SubmissionListPage } from './pages/SubmissionListPage';
import { SubmissionSubmitPage } from './pages/SubmissionSubmitPage';
import { Task1CasePage } from './pages/Task1CasePage';
import { Task1Page } from './pages/Task1Page';

function Guarded({ children }: { children: ReactElement }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ScoreboardPage />} />
        <Route path="/oauth" element={<LoginPage />} />
        <Route path="/forgetPassword" element={<ForgotPasswordPage />} />

        <Route
          path="/submission"
          element={
            <Guarded>
              <SubmissionListPage />
            </Guarded>
          }
        />
        <Route
          path="/submission/submit"
          element={
            <Guarded>
              <SubmissionSubmitPage />
            </Guarded>
          }
        />
        <Route
          path="/submission/check/:id"
          element={
            <Guarded>
              <SubmissionDetailPage />
            </Guarded>
          }
        />
        <Route
          path="/submission/O1"
          element={
            <Guarded>
              <Task1Page />
            </Guarded>
          }
        />
        <Route
          path="/submission/O1/:id"
          element={
            <Guarded>
              <Task1CasePage />
            </Guarded>
          }
        />

        <Route path="/match" element={<MatchListPage />} />
        <Route path="/match/:id" element={<MatchDetailPage />} />

        <Route
          path="/profile"
          element={
            <Guarded>
              <ProfilePage />
            </Guarded>
          }
        />
        <Route
          path="/profile/settings"
          element={
            <Guarded>
              <SettingsPage />
            </Guarded>
          }
        />

        <Route path="/rules" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
