// =============================================================
// WhyUs — "What makes this different" comparison section
// Features:
// - Two-column comparison: "A typical inventory website" vs "Smart Warehouse"
// - 6 clear, honest differences comparing manual typing to physical automation
// - Clear honest disclaimer note at the bottom
// - Alternating slide-in on scroll (IntersectionObserver)
// =============================================================

import { useEffect, useRef } from 'react';

// EDIT HERE: Comparison points
const COMPARISON_ROWS = [
  {
    topic: 'Adding a parcel',
    typical: 'Typed in by hand or scanned one-by-one with expensive handhelds.',
    smart: 'Read automatically from an RFID tag when the box passes the station.',
  },
  {
    topic: 'Knowing it arrived',
    typical: 'You trust whoever entered the data into the spreadsheet.',
    smart: 'An infrared beam sensor confirms the box physically broke the beam.',
  },
  {
    topic: 'Sorting',
    typical: 'Workers read labels and sort by eye or carry boxes manually.',
    smart: 'A servo gate routes under 10 kg left and 10 kg or more right.',
  },
  {
    topic: 'Planning',
    typical: 'Guesswork, gut feeling, or static quarterly spreadsheets.',
    smart: 'A daily forecast compared with the parcels that actually arrived.',
  },
  {
    topic: 'Expiry management',
    typical: 'Found when someone randomly checks the shelf or stock spoils.',
    smart: 'Flagged before it happens when a box is predicted to sell after expiry.',
  },
  {
    topic: 'Cost and setup',
    typical: 'Expensive enterprise scanners, proprietary server stacks.',
    smart: 'Affordable ESP32 microcontrollers, open web app on any browser.',
  },
];

export function WhyUs() {
  const tableRef = useRef(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const rows = table.querySelectorAll('.compare-body-row');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="why-us-section" id="why-us">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Why Us</span>
          </div>
          <h2 className="landing-section-title">What makes this different</h2>
          <p className="landing-section-subtitle">
            Many inventory websites depend on people typing things in. Ours is connected to the physical warehouse.
          </p>
        </div>

        <div className="compare-card-table" ref={tableRef}>
          {/* Header Row */}
          <div className="compare-head-row">
            <div className="compare-head-cell">
              A typical inventory website
            </div>
            <div className="compare-head-cell highlight">
              Smart Warehouse
            </div>
          </div>

          {/* Body Rows */}
          {COMPARISON_ROWS.map((row, i) => (
            <div className="compare-body-row" key={row.topic}>
              {/* Typical Column */}
              <div className="compare-cell typical">
                <div className="compare-topic-label">{row.topic}</div>
                <div>{row.typical}</div>
              </div>

              {/* Smart Warehouse Column */}
              <div className="compare-cell smart">
                <div className="compare-topic-label">{row.topic}</div>
                <div>
                  <span className="compare-check-icon">✓</span>
                  {row.smart}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Honest Disclaimer */}
        <p className="honest-disclaimer-note">
          Note: In this demo, expiry dates, sell-by predictions and the forecast use simulated data. Arrival detection and weight sorting come directly from the physical hardware.
        </p>
      </div>
    </section>
  );
}
