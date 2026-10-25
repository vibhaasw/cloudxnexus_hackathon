// =============================================================
// LandingNav — Sticky top bar on every landing page section
// Features:
// - Left: SVG box icon logo + "Smart Warehouse"
// - Centre: Product dropdown (Sorting, Expiry alerts, Forecast),
//           How it works, Why us, Dashboard (with live orange dot), FAQ
// - Right: "Team" link and filled orange button "Open dashboard"
// - On scroll: shrinks slightly, blurred dark background with 1px border
// - Mobile: hamburger opens full-width drawer menu
// =============================================================

import { useEffect, useState } from 'react';

// EDIT HERE: Nav links and labels
export function LandingNav({ onOpenDashboard }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    setMobileOpen(false);
    setDropdownOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`landing-nav-wrap ${scrolled ? 'scrolled' : ''}`}>
      <div className="landing-container">
        <header className="landing-nav" role="banner">
          {/* Logo */}
          <a
            href="#/"
            className="landing-logo"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span>Smart Warehouse</span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="landing-nav-links" aria-label="Main Landing Navigation">
            {/* Product Dropdown */}
            <div
              className="nav-dropdown-wrap"
              onMouseEnter={() => setDropdownOpen(true)}
              onMouseLeave={() => setDropdownOpen(false)}
            >
              <button
                type="button"
                className="landing-nav-link"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((prev) => !prev)}
              >
                <span>Product</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div className="nav-dropdown-menu" role="menu">
                <button
                  type="button"
                  className="nav-dropdown-item"
                  onClick={() => scrollToSection('mini-belt')}
                >
                  <span className="item-icon">⚖️</span>
                  <span>Sorting</span>
                </button>
                <button
                  type="button"
                  className="nav-dropdown-item"
                  onClick={() => scrollToSection('why-us')}
                >
                  <span className="item-icon">⚠️</span>
                  <span>Expiry alerts</span>
                </button>
                <button
                  type="button"
                  className="nav-dropdown-item"
                  onClick={() => scrollToSection('preview')}
                >
                  <span className="item-icon">📈</span>
                  <span>Forecast</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="landing-nav-link"
              onClick={() => scrollToSection('how-it-works')}
            >
              How it works
            </button>

            <button
              type="button"
              className="landing-nav-link"
              onClick={() => scrollToSection('why-us')}
            >
              Why us
            </button>

            {/* Dashboard Link with Pulsing Orange Dot */}
            <button
              type="button"
              className="landing-nav-link has-dot"
              onClick={onOpenDashboard}
              title="Open the owner dashboard"
            >
              Dashboard
            </button>

            <button
              type="button"
              className="landing-nav-link"
              onClick={() => scrollToSection('faq')}
            >
              FAQ
            </button>
          </nav>

          {/* Right Actions */}
          <div className="landing-nav-actions">
            <button
              type="button"
              className="team-nav-link"
              onClick={() => scrollToSection('team')}
            >
              Team
            </button>
            <button
              type="button"
              className="btn-orange"
              onClick={onOpenDashboard}
            >
              Open dashboard
            </button>
            <button
              type="button"
              className="mobile-hamburger-btn"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label="Toggle mobile navigation menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </header>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="mobile-menu-drawer" role="menu">
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('mini-belt')}
          >
            Product & Sorting
          </button>
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('how-it-works')}
          >
            How it works
          </button>
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('why-us')}
          >
            Why us
          </button>
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('who-its-for')}
          >
            Who it's for
          </button>
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('team')}
          >
            Team
          </button>
          <button
            type="button"
            className="mobile-nav-link"
            onClick={() => scrollToSection('faq')}
          >
            FAQ
          </button>
          <button
            type="button"
            className="btn-orange"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => {
              setMobileOpen(false);
              onOpenDashboard();
            }}
          >
            Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}
