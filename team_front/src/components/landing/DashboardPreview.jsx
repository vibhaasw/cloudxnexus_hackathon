// =============================================================
// DashboardPreview — Framed interactive preview of the owner dashboard
// Features:
// - Browser mock header with window dots and URL bar
// - Live preview of the Today summary metrics
// - Direct "Open the dashboard" CTA button
// =============================================================

export function DashboardPreview({ onOpenDashboard }) {
  return (
    <section className="preview-section" id="preview">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Owner Dashboard</span>
          </div>
          <h2 className="landing-section-title">Clean, human-readable information</h2>
          <p className="landing-section-subtitle">
            No charts cluttering the view, no technical jargon. Just clear numbers and sentences anyone can understand.
          </p>
        </div>

        <div className="preview-frame">
          {/* Browser Window Chrome */}
          <div className="preview-browser-bar">
            <span className="browser-dot red" />
            <span className="browser-dot yellow" />
            <span className="browser-dot green" />
            <span className="browser-url-bar">smart-warehouse.local/#/dashboard/today</span>
          </div>

          {/* Preview Window Content */}
          <div className="preview-content">
            <h3 className="preview-headline">
              <span className="text-orange">32 of 45 parcels</span> have arrived today.
            </h3>
            <p className="preview-subline">
              13 more are expected before dock cutoff.
            </p>

            <div className="preview-mini-grid">
              <div className="preview-stat-card">
                <div className="preview-stat-num">18</div>
                <div className="preview-stat-label">Went left (under 10 kg)</div>
              </div>
              <div className="preview-stat-card gold">
                <div className="preview-stat-num">14</div>
                <div className="preview-stat-label">Went right (10 kg and over)</div>
              </div>
              <div className="preview-stat-card red">
                <div className="preview-stat-num">3</div>
                <div className="preview-stat-label">May expire before they sell</div>
              </div>
            </div>

            <button
              type="button"
              className="btn-orange"
              onClick={onOpenDashboard}
            >
              Open the live dashboard →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
