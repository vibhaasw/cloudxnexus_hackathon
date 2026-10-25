// =============================================================
// WhoItsFor — Audience use-case tabs
// Features:
// - Tabs: "Small shops", "Distributors", "Food and grocery", "Pharmacies"
// - 3 feature cards per tab explaining direct benefits in plain words
// - Clean cross-fade transition on tab change
// =============================================================

import { useState } from 'react';

// EDIT HERE: Audience groups and their 3 benefit cards
const AUDIENCES = [
  {
    id: 'shops',
    name: 'Small shops',
    cards: [
      {
        icon: '🏪',
        title: 'Runs on your phone',
        desc: 'Check arrived stock from the shop counter without needing a laptop or dedicated workstation.',
      },
      {
        icon: '🏷️',
        title: 'Zero barcode scanning',
        desc: 'Boxes are detected as delivery drivers wheel them through the door, freeing staff for customers.',
      },
      {
        icon: '⏰',
        title: 'Never lose stock to expiry',
        desc: 'Get an early heads-up when slow-selling items risk spoiling before customer demand catches up.',
      },
    ],
  },
  {
    id: 'distributors',
    name: 'Distributors',
    cards: [
      {
        icon: '🚚',
        title: 'Automated weight sorting',
        desc: 'Heavy wholesale crates (≥ 10 kg) are split immediately from lightweight cartons for pallet staging.',
      },
      {
        icon: '📊',
        title: 'Daily arrival pacing',
        desc: 'Compare incoming truck manifests with real sensor intake counts to spot shortages instantly.',
      },
      {
        icon: '☁️',
        title: 'Synced cloud history',
        desc: 'Every tag and physical timestamp is stored in a clean cloud database with zero manual data entry.',
      },
    ],
  },
  {
    id: 'grocery',
    name: 'Food and grocery',
    cards: [
      {
        icon: '🥛',
        title: 'First-to-expire warnings',
        desc: 'Clear red alerts highlight dairy, produce, and fresh juices that must be placed on shelves first.',
      },
      {
        icon: '❄️',
        title: 'Hands-free intake',
        desc: 'Keep cold-chain deliveries moving quickly into walk-in chillers without manual barcode checks.',
      },
      {
        icon: '📈',
        title: 'Demand forecasting',
        desc: 'Plan weekly perishables orders using historical weekday intake trends rather than guesswork.',
      },
    ],
  },
  {
    id: 'pharmacies',
    name: 'Pharmacies',
    cards: [
      {
        icon: '💊',
        title: 'Shelf-life compliance',
        desc: 'Automatically flag medical supplies when predicted dispense rates lag behind manufacturer expiry.',
      },
      {
        icon: '🛡️',
        title: 'Physical receipt proof',
        desc: 'The infrared sensor confirms the parcel physically crossed the intake portal, eliminating entry errors.',
      },
      {
        icon: '📋',
        title: 'Simple plain-language logs',
        desc: 'No cryptic SKU codes or tech jargon—staff see clear product names and arrival times.',
      },
    ],
  },
];

export function WhoItsFor() {
  const [activeTab, setActiveTab] = useState('shops');
  const currentAudience = AUDIENCES.find((a) => a.id === activeTab) || AUDIENCES[0];

  return (
    <section className="who-section" id="who-its-for">
      <div className="landing-container">
        <div className="landing-section-header">
          <div className="landing-tag">
            <span className="landing-tag-dot" />
            <span>Built For Real Owners</span>
          </div>
          <h2 className="landing-section-title">Designed for businesses with physical goods</h2>
          <p className="landing-section-subtitle">
            Whether you run a neighbourhood grocer or a regional logistics hub, Smart Warehouse fits your daily routine.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="who-tabs-nav" role="tablist" aria-label="Audience categories">
          {AUDIENCES.map((aud) => (
            <button
              key={aud.id}
              type="button"
              role="tab"
              aria-selected={activeTab === aud.id}
              className={`who-tab-btn ${activeTab === aud.id ? 'active' : ''}`}
              onClick={() => setActiveTab(aud.id)}
            >
              {aud.name}
            </button>
          ))}
        </div>

        {/* 3 Feature Cards */}
        <div className="who-cards-grid" role="tabpanel">
          {currentAudience.cards.map((card, i) => (
            <div className="who-card" key={card.title}>
              <div className="who-card-icon">{card.icon}</div>
              <h3 className="who-card-title">{card.title}</h3>
              <p className="who-card-desc">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
