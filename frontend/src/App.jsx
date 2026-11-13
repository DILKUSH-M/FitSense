import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';

const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NutritionPage = lazy(() => import('./pages/NutritionPage'));
const PostureCoachPage = lazy(() => import('./pages/PostureCoachPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage'));

function AppShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading FitSense…</div>;
  }

  if (!user) {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading FitSense…</div>}><LoginPage /></Suspense>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 md:flex-row">
      <Sidebar currentPath={location.pathname} onNavigate={(path) => navigate(path)} user={user} onLogout={logout} />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense fallback={<div className="animate-pulse rounded-3xl bg-slate-900 p-8 text-slate-400">Loading page…</div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/workouts" element={<WorkoutsPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/nutrition" element={<NutritionPage />} />
            <Route path="/posture" element={<PostureCoachPage />} />
            <Route path="/recommendations" element={<RecommendationsPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
