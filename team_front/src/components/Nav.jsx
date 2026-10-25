// =============================================================
// Nav — Dashboard header bar + three-tab navigation
// Features:
// - Logo linking back to landing page
// - "Home" link to return to front door anytime
// - Today / Parcels / Forecast tabs with gliding pill indicator
// - "Demo data" indicator pill
// - Theme toggle for dashboard light / dark mode
// - Mobile bottom bar for quick 1-handed thumb navigation
// =============================================================

import { useEffect, useRef } from 'react';

const TABS = [
  { id: 'today',    label: 'Today' },
  { id: 'parcels',  label: 'Parcels' },
  { id: 'forecast', label: 'Forecast' },
];

export function Nav({ activeTab, onTabChange, onGoHome, dark, onToggleDark }) {
  const desktopPill = useRef(null);
  const mobilePill = useRef(null);
  const tabIndex = TABS.findIndex((tab) => tab.id === activeTab);

  useEffect(() => {
    [desktopPill.current, mobilePill.current].forEach((pill) => {
      if (pill) pill.style.transform = `translateX(${tabIndex * 100}%)`;
    });
  }, [tabIndex]);

  const renderTabs = (location) => (
    <nav className={`main-nav main-nav--${location}`} aria-label="Dashboard Navigation">
      <ul className="nav-list">
        <li className="nav-pill" ref={location === 'desktop' ? desktopPill : mobilePill} aria-hidden="true" />
        {TABS.map((tab) => (
          <li key={tab.id}>
            <button
              className="nav-tab"
              type="button"
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          {/* Logo links back to landing page */}
          <a
            className="header-brand"
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              if (onGoHome) onGoHome();
            }}
            title="Return to home page"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--blue)' }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span>Smart Warehouse</span>
          </a>

          {/* Desktop Tabs */}
          {renderTabs('desktop')}

          <div className="header-actions">
            {/* Home link */}
            <a
              href="#/"
              className="header-compare-link"
              onClick={(e) => {
                e.preventDefault();
                if (onGoHome) onGoHome();
              }}
              style={{ fontWeight: 600, color: 'var(--ink)' }}
            >
              ← Home
            </a>

            <span className="demo-pill">Demo data</span>

            {/* Dark/Light mode toggle */}
            <button
              className="theme-toggle"
              type="button"
              onClick={onToggleDark}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tabs */}
      {renderTabs('mobile')}
    </>
  );
}
