// =============================================================
// Strip — Slow scrolling marquee of system capabilities
// Features:
// - Plain text chips with small orange dot accents
// - Constant smooth CSS marquee scroll, pauses on hover
// - No customer logos or fake endorsements
// =============================================================

// EDIT HERE: The chips listed in the marquee strip
const CAPABILITIES = [
  'RFID tag reading',
  'Infrared arrival check',
  'Weight sorting',
  'Cloud database',
  'AI forecast',
  'Expiry alerts',
  'Works on any phone',
  'Servo diverter gate',
  'Real-time intake log',
];

export function Strip() {
  // Duplicate list to make infinite looping seamless
  const duplicated = [...CAPABILITIES, ...CAPABILITIES];

  return (
    <section className="marquee-strip-section" aria-label="System capabilities">
      <div className="marquee-track">
        {duplicated.map((cap, i) => (
          <div className="marquee-chip" key={`${cap}-${i}`}>
            <span className="marquee-chip-dot" />
            <span>{cap}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
