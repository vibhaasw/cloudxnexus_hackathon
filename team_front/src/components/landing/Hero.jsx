// =============================================================
// Hero — The front door hero section
// Features:
// - Huge headline with key phrase highlighted in orange
// - Subtitle explaining RFID, IR sensor & AI forecast
// - Live feed demo box typing warehouse events in a loop
// - 3 quick-action cards leading directly to dashboard tabs
// =============================================================

import { useEffect, useState } from 'react';

// EDIT HERE: The live feed demo messages that cycle in the prompt box
const FEED_EVENTS = [
  'Tag 11223344 scanned: Rice bag, 15 kg. Sent to the right lane.',
  'Organic milk may expire before it sells. Flagged to sell first.',
  'Tag 55667791 scanned: Coffee beans, 5 kg. Sent to the left lane.',
  'IR sensor confirmed box arrival at intake gate #1.',
  'Strawberries at risk: expires in 3 days, predicted sold in 5 days.',
  'AI forecast updated: 38 parcels expected tomorrow.',
];

export function Hero({ onOpenDashboard, onNavigateTab }) {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Typewriter effect for the live feed demo box
  useEffect(() => {
    const fullText = FEED_EVENTS[currentLineIndex];
    let timer;

    if (!isDeleting && displayedText.length < fullText.length) {
      // Typing forward
      timer = setTimeout(() => {
        setDisplayedText(fullText.slice(0, displayedText.length + 1));
      }, 40);
    } else if (!isDeleting && displayedText.length === fullText.length) {
      // Pause at full sentence before deleting
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, 2400);
    } else if (isDeleting && displayedText.length > 0) {
      // Deleting fast
      timer = setTimeout(() => {
        setDisplayedText(fullText.slice(0, displayedText.length - 1));
      }, 18);
    } else if (isDeleting && displayedText.length === 0) {
      // Next sentence
      setIsDeleting(false);
      setCurrentLineIndex((prev) => (prev + 1) % FEED_EVENTS.length);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, currentLineIndex]);

  return (
    <section className="landing-hero" id="hero">
      <div className="landing-container">
        {/* Top Tagline Badge */}
        <div className="hero-pill-badge">
          <span className="landing-tag-dot" />
          <span>Smart logistics for physical warehouses</span>
        </div>

        {/* Huge Headline: key phrase in orange */}
        <h1 className="hero-headline">
          The warehouse that knows{' '}
          <span className="text-orange">what arrives, where it goes</span> and when it sells.
        </h1>

        {/* Subline */}
        <p className="hero-subline" style={{ textAlign: 'center', margin: '0 auto 48px auto' }}>
          RFID tags, an IR sensor and an AI forecast in one simple app.<br className="hero-subline-br" />
          Sorted automatically. Warned before stock expires.
        </p>

        {/* Live Feed Demo Input Box (Chat prompt style with soft orange glow) */}
        <div className="hero-feed-container">
          <div className="hero-feed-glow" aria-hidden="true" />
          <div className="hero-feed-box">
            <div className="hero-feed-content">
              <span className="hero-feed-status-dot" title="Live sensor feed active" />
              <div className="hero-feed-text-wrap">
                <span>{displayedText}</span>
                <span className="hero-feed-caret" />
              </div>
            </div>
            <button
              type="button"
              className="hero-feed-btn"
              onClick={() => onOpenDashboard()}
              title="Open the dashboard"
              aria-label="Open the dashboard"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>

        {/* Three Quick-Action Cards */}
        <div className="hero-quick-cards">
          {/* Card 1: Today */}
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigateTab('today')}
          >
            <div className="quick-card-left">
              <div className="quick-card-icon">📦</div>
              <div>
                <div className="quick-card-title">See today's parcels</div>
                <div className="quick-card-sub">32 arrived · 13 expected</div>
              </div>
            </div>
            <span className="quick-card-arrow">→</span>
          </button>

          {/* Card 2: Expiry Risk */}
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigateTab('parcels', { filter: 'At risk' })}
          >
            <div className="quick-card-left">
              <div className="quick-card-icon">⚠️</div>
              <div>
                <div className="quick-card-title">Check what may expire</div>
                <div className="quick-card-sub">Stock at risk before selling</div>
              </div>
            </div>
            <span className="quick-card-arrow">→</span>
          </button>

          {/* Card 3: Forecast */}
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigateTab('forecast')}
          >
            <div className="quick-card-left">
              <div className="quick-card-icon">📈</div>
              <div>
                <div className="quick-card-title">View the forecast</div>
                <div className="quick-card-sub">7-day daily arrivals</div>
              </div>
            </div>
            <span className="quick-card-arrow">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
