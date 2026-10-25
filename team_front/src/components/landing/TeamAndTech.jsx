// =============================================================
// TeamAndTech — Team Hyxon and technology stack
// Features:
// - Team name: Team Hyxon
// - Project name: Smart Warehouse
// - Tech stack chips: ESP32, RFID, IR sensor, Servo, React, Cloud database
// - Hackathon dedication line
// =============================================================

// EDIT HERE: Tech stack chips used in the physical build
const TECH_STACK = [
  'ESP32 Microcontroller',
  'RC522 RFID Antenna',
  'Infrared Obstacle Sensor',
  'SG90 Servo Gate',
  'React 19 & Vite',
  'Cloud Realtime Database',
  'Plain CSS Architecture',
  'Web Animations API',
];

export function TeamAndTech() {
  return (
    <section className="team-section" id="team">
      <div className="landing-container">
        <div className="team-card">
          <div className="team-badge">Engineered with Purpose</div>
          {/* EDIT HERE: Team name requested by user */}
          <h2 className="team-name">Team Hyxon</h2>
          <p className="team-hackathon-line">
            {/* EDIT HERE: Hackathon name */}
            Built for the Innovation Hackathon · Project Smart Warehouse
          </p>

          <div className="tech-chips-wrap">
            {TECH_STACK.map((tech) => (
              <span className="tech-chip" key={tech}>
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
