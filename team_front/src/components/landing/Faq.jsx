// =============================================================
// Faq — Frequently asked questions accordion
// Features:
// - 6 questions answered honestly and without exaggeration
// - Smooth grid-template-rows expansion animation
// - Plus icon rotates 45 degrees to become an 'x' / minus
// =============================================================

import { useState } from 'react';

// EDIT HERE: The 6 FAQ questions and answers
const FAQS = [
  {
    question: 'Is the data real?',
    answer:
      'The physical hardware events (RFID scans, infrared beam triggers, and servo gate sorting) are real. Expiry dates, sell-by predictions, and the 7-day arrival forecast use simulated data models for demonstration purposes.',
  },
  {
    question: 'Can it use my existing products?',
    answer:
      'Yes. Standard passive RFID sticker tags can be applied to any existing cardboard cartons, plastic crates, or packaging. No expensive proprietary tags are required.',
  },
  {
    question: 'What if the sensor misses a box?',
    answer:
      'The app compares expected deliveries against the sensor intake count. If a parcel is scanned by RFID but fails to trigger the infrared arrival sensor, a mismatch is instantly highlighted on the Today dashboard.',
  },
  {
    question: 'Do I need special equipment?',
    answer:
      'No. The entire sorting station runs on an inexpensive ESP32 microcontroller, standard hobby servo, and cheap IR diodes. The owner app runs directly inside any web browser on iOS, Android, macOS, or Windows.',
  },
  {
    question: 'What does it cost to build?',
    answer:
      'The complete hardware assembly (ESP32, RC522 RFID reader, IR optical sensor, and SG90 servo gate) costs under $25 total. The software has zero recurring licensing fees.',
  },
  {
    question: 'Can I use it on my phone?',
    answer:
      'Yes. The app is mobile-first with a fixed bottom navigation bar, large tap targets, and full touch support. You can pin it to your phone home screen just like a native app.',
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState(0); // first item open by default

  const toggle = (idx) => {
    setOpenIndex((curr) => (curr === idx ? -1 : idx));
  };

  return (
    <section className="faq-section" id="faq">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Got Questions?</span>
          </div>
          <h2 className="landing-section-title">Frequently asked questions</h2>
          <p className="landing-section-subtitle">
            Clear, honest answers about the hardware, software, and real warehouse deployment.
          </p>
        </div>

        <div className="faq-list">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div className={`faq-item ${isOpen ? 'open' : ''}`} key={faq.question}>
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <span className="faq-icon" aria-hidden="true">
                    +
                  </span>
                </button>
                <div className="faq-answer-collapse">
                  <div className="faq-answer-inner">
                    <p className="faq-answer-content">{faq.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
