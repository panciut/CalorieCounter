import { useEffect } from 'react';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import { NavigationProvider, useNavigate } from './hooks/useNavigate';
import { PantryProvider } from './hooks/usePantry';
import { ToastProvider, useToast } from './components/Toast';
import { useUndo } from './hooks/useUndo';
import { useT } from './i18n/useT';

// Pages
import DashboardPage    from './pages/DashboardPage';
import ExercisePage     from './pages/ExercisePage';
import NetPage          from './pages/NetPage';
import FoodsPage        from './pages/FoodsPage';
import PantryPage       from './pages/PantryPage';
import RecipesPage      from './pages/RecipesPage';
import HistoryPage      from './pages/HistoryPage';
import StatsPage        from './pages/StatsPage';
import WeekPage         from './pages/WeekPage';
import PlanPage         from './pages/PlanPage';
import WeightPage       from './pages/WeightPage';
import SupplementsPage  from './pages/SupplementsPage';
import MeasurementsPage from './pages/MeasurementsPage';
import GoalsPage        from './pages/GoalsPage';
import DataPage         from './pages/DataPage';
import SettingsPage     from './pages/SettingsPage';
import ComparePage      from './pages/ComparePage';
import NotificationsPage from './pages/NotificationsPage';

import Nav from './components/Nav';

// ── Inner app (has access to contexts) ───────────────────────────────────────

function AppInner() {
  const { settings } = useSettings();
  const { page, param, navigate } = useNavigate();
  const { showToast } = useToast();
  const { t } = useT();

  useUndo(showToast, t('undo.undone'));

  // Sync theme to body class
  useEffect(() => {
    document.body.classList.toggle('light', settings.theme === 'light');
  }, [settings.theme]);

  // Listen for main process shortcut:quickAdd
  useEffect(() => {
    const handler = () => navigate('dashboard');
    window.electronAPI?.on('shortcut:quickAdd', handler);
    return () => window.electronAPI?.off('shortcut:quickAdd');
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text">
      <Nav activePage={page} />
      <main className="flex-1 overflow-y-auto">
        {page === 'dashboard'    && <DashboardPage />}
        {page === 'exercise'     && <ExercisePage />}
        {page === 'net'          && <NetPage />}
        {page === 'foods'        && <FoodsPage />}
        {page === 'compare'      && <ComparePage />}
        {page === 'pantry'       && settings.pantry_enabled !== 0 && <PantryPage />}
        {page === 'pantry'       && settings.pantry_enabled === 0 && <DashboardPage />}
        {page === 'recipes'      && <RecipesPage />}
        {page === 'history'      && <HistoryPage />}
        {page === 'stats'        && <StatsPage />}
        {page === 'week'         && <WeekPage weekStart={param?.weekStart} />}
        {page === 'plan'         && <PlanPage />}
        {page === 'day'          && <DashboardPage initialDate={param?.date} fromWeek={param?.fromWeek} />}
        {page === 'weight'       && <WeightPage />}
        {page === 'supplements'  && <SupplementsPage />}
        {page === 'measurements' && <MeasurementsPage />}
        {page === 'goals'        && <GoalsPage />}
        {page === 'data'         && <DataPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'settings'     && <SettingsPage />}
      </main>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <PantryProvider>
          <NavigationProvider>
            <AppInner />
          </NavigationProvider>
        </PantryProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
