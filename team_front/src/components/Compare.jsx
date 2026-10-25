import { useEffect, useRef, useState } from 'react';

const rows = [
  ['Adding a parcel', 'Someone types it in or scans it by hand.', 'An RFID tag is read automatically when the parcel passes the station.'],
  ['Knowing it really arrived', 'You trust whoever entered it.', 'An infrared sensor confirms the box physically arrived.'],
  ['Sorting', 'Workers sort by hand or by eye.', 'A servo gate sends under 10 kg left and 10 kg or more right.'],
  ['Planning', 'A guess or a spreadsheet.', 'A forecast of parcels per day, compared with the parcels that actually arrived.'],
  ['Expiry', 'Found when someone checks the shelves.', 'Flagged before it happens, when a box is predicted to sell after it expires.'],
];

// Compare explains the differences between a typical inventory website and this setup.
export function Compare() {
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || visible) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <section id="compare" className="compare-section" ref={sectionRef}>
      <h2 className="compare-title">What's different about this app</h2>
      <p className="compare-subtitle">
        Many inventory websites depend on people typing things in. Ours is connected to the physical warehouse.
      </p>
      <div className={`compare-table${visible ? ' compare-table--visible' : ''}`}>
        <div className="compare-head compare-row">
          <span />
          <h3>A typical inventory website</h3>
          <h3>Smart Warehouse</h3>
        </div>
        {rows.map(([topic, typical, smart], index) => (
          <div className="compare-row" key={topic} style={{ '--row-delay': `${index * 60}ms` }}>
            <h3 className="compare-topic">{topic}</h3>
            <p className="compare-cell compare-cell--old" style={{ '--cell-delay': `${index * 60}ms` }}>{typical}</p>
            <p className="compare-cell compare-cell--new" style={{ '--cell-delay': `${index * 60}ms` }}>
              <svg className="compare-tick" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5 7 13l8-8" /></svg>
              {smart}
            </p>
          </div>
        ))}
      </div>
      <p className="compare-note">
        In this demo, expiry dates, sell-by predictions and the forecast use simulated data. Arrival detection and sorting come from the hardware.
      </p>
    </section>
  );
}
