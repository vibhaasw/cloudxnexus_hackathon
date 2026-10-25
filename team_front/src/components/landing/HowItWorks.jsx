// =============================================================
// HowItWorks — Four simple hardware & cloud steps
// Features:
// - Step 1: Scan the tag (RFID)
// - Step 2: Confirm arrival (IR sensor)
// - Step 3: Sort by weight (Servo gate)
// - Step 4: Know what happens next (Forecast & Cloud)
// - Clean responsive cards with numbered badges
// =============================================================

// EDIT HERE: Step titles and explanations
const STEPS = [
  {
    num: '1',
    title: 'Scan the tag',
    desc: 'An RFID antenna reads the tag attached to the box as it passes the intake conveyor.',
  },
  {
    num: '2',
    title: 'Confirm arrival',
    desc: 'An infrared beam sensor verifies that the box physically arrived and was not just keyed in.',
  },
  {
    num: '3',
    title: 'Sort by weight',
    desc: 'Under 10 kg slides to the left lane; 10 kg or more is directed to the right lane by the servo gate.',
  },
  {
    num: '4',
    title: 'Know what happens next',
    desc: 'The app predicts daily arrival patterns and flags stock that might expire before it is sold.',
  },
];

export function HowItWorks() {
  return (
    <section className="how-section" id="how-it-works">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Workflow</span>
          </div>
          <h2 className="landing-section-title">How physical warehouse sorting works</h2>
          <p className="landing-section-subtitle">
            From arrival dock to inventory forecast in four automated seconds.
          </p>
        </div>

        <div className="how-steps-wrap">
          {STEPS.map((step) => (
            <div className="how-step-card" key={step.num}>
              <div className="how-step-badge">{step.num}</div>
              <h3 className="how-step-title">{step.title}</h3>
              <p className="how-step-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
