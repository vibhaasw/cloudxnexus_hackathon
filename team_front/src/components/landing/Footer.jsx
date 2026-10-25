// =============================================================
// Footer — Final call to action & multi-column footer
// Features:
// - Big closing headline: "Open the first box."
// - Orange "Open dashboard" button
// - 4 columns: Product, How it works, Team Hyxon, Dashboard
// - Copyright and project tagline line
// =============================================================

export function Footer({ onOpenDashboard, onNavigateTab }) {
  const currentYear = new Date().getFullYear();

  return (
    <>
      {/* Final Call to Action */}
      <section className="final-cta-section">
        <div className="landing-container">
          <h2 className="final-cta-headline">
            Open the <span className="text-orange">first box</span>.
          </h2>
          <button
            type="button"
            className="btn-orange"
            style={{ fontSize: '16px', padding: '14px 32px' }}
            onClick={onOpenDashboard}
          >
            Open dashboard →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-container">
          <div className="footer-columns-grid">
            {/* Col 1: Brand & Tagline */}
            <div>
              <div className="landing-logo" style={{ marginBottom: '14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>Smart Warehouse</span>
              </div>
              <p style={{ fontSize: '14px', color: '#888', maxWidth: '280px', lineHeight: '1.5' }}>
                Physical automated parcel sorting and intelligent expiry forecasting for warehouse owners.
              </p>
            </div>

            {/* Col 2: Product */}
            <div>
              <div className="footer-col-title">Product</div>
              <ul className="footer-links-list">
                <li><a href="#mini-belt" className="footer-link">Weight Sorting</a></li>
                <li><a href="#why-us" className="footer-link">Expiry Alerts</a></li>
                <li><a href="#preview" className="footer-link">Arrival Forecast</a></li>
                <li><a href="#who-its-for" className="footer-link">Who It's For</a></li>
              </ul>
            </div>

            {/* Col 3: Team */}
            <div>
              <div className="footer-col-title">Team</div>
              <ul className="footer-links-list">
                <li><a href="#team" className="footer-link">Team Hyxon</a></li>
                <li><a href="#how-it-works" className="footer-link">How It Works</a></li>
                <li><a href="#faq" className="footer-link">FAQ</a></li>
              </ul>
            </div>

            {/* Col 4: Dashboard Links */}
            <div>
              <div className="footer-col-title">Dashboard</div>
              <ul className="footer-links-list">
                <li>
                  <button type="button" className="footer-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => onNavigateTab('today')}>
                    Today Tab
                  </button>
                </li>
                <li>
                  <button type="button" className="footer-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => onNavigateTab('parcels')}>
                    Parcels List
                  </button>
                </li>
                <li>
                  <button type="button" className="footer-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => onNavigateTab('forecast')}>
                    7-Day Forecast
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom-row">
            <div>© {currentYear} Smart Warehouse by Team Hyxon. All rights reserved.</div>
            <div style={{ color: '#555' }}>Built with React, Vite & ESP32 hardware</div>
          </div>
        </div>
      </footer>
    </>
  );
}
