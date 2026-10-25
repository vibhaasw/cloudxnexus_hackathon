// =============================================================
// App — Root application with HashRouter and Page Wiper Transition
// Routes:
//   /                    → Landing Page
//   /dashboard           → Redirect to /dashboard/today
//   /dashboard/today     → Owner Dashboard (Today Tab)
//   /dashboard/parcels   → Owner Dashboard (Parcels Tab)
//   /dashboard/forecast  → Owner Dashboard (Forecast Tab)
// =============================================================

import { useState, useCallback } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { LandingPage } from './components/landing/LandingPage';
import { DashboardApp } from './components/DashboardApp';

// Wrapper for the landing page that connects navigation to the router with the orange wipe
function LandingRoute({ onNavigateWithWipe }) {
  const handleOpenDashboard = useCallback(() => {
    onNavigateWithWipe('/dashboard/today');
  }, [onNavigateWithWipe]);

  const handleNavigateTab = useCallback((tab, options) => {
    let target = `/dashboard/${tab}`;
    if (options?.filter) {
      target += `?filter=${encodeURIComponent(options.filter)}`;
    }
    onNavigateWithWipe(target);
  }, [onNavigateWithWipe]);

  return (
    <LandingPage
      onOpenDashboard={handleOpenDashboard}
      onNavigateTab={handleNavigateTab}
    />
  );
}

// Wrapper for dashboard routes reading tab param and search params
function DashboardRoute({ onNavigateWithWipe }) {
  const { tab = 'today' } = useParams();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');

  const handleTabChange = useCallback((nextTab) => {
    onNavigateWithWipe(`/dashboard/${nextTab}`, false); // within-dashboard tab change doesn't need full wipe
  }, [onNavigateWithWipe]);

  const handleGoHome = useCallback(() => {
    onNavigateWithWipe('/');
  }, [onNavigateWithWipe]);

  return (
    <DashboardApp
      currentTab={tab}
      onTabChange={handleTabChange}
      onGoHome={handleGoHome}
      initialFilter={filterParam}
    />
  );
}

// Main App Controller inside HashRouter
function AppContent() {
  const navigate = useNavigate();
  const [wiperState, setWiperState] = useState('idle'); // 'idle' | 'wiping-in' | 'wiping-out'

  const navigateWithWipe = useCallback((targetUrl, fullWipe = true) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!fullWipe || reducedMotion) {
      navigate(targetUrl);
      return;
    }

    // Play orange panel wipe across screen
    setWiperState('wiping-in');

    setTimeout(() => {
      navigate(targetUrl);
      setWiperState('wiping-out');

      setTimeout(() => {
        setWiperState('idle');
      }, 320);
    }, 300);
  }, [navigate]);

  return (
    <>
      {/* Orange wiper panel transition */}
      <div className={`orange-page-wiper ${wiperState}`} aria-hidden="true" />

      <Routes>
        {/* Landing Page Route */}
        <Route path="/" element={<LandingRoute onNavigateWithWipe={navigateWithWipe} />} />

        {/* Dashboard Redirect */}
        <Route path="/dashboard" element={<Navigate to="/dashboard/today" replace />} />

        {/* Dashboard Tabs Routes */}
        <Route path="/dashboard/:tab" element={<DashboardRoute onNavigateWithWipe={navigateWithWipe} />} />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
