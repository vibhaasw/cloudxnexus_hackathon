import { useEffect, useMemo, useState } from 'react';
import { isAtRisk, laneFor } from '../data/mock';
import { CountUp } from './CountUp';

// Today shows arrivals, sorting totals, urgent stock and a simple sorting guide.
export function Today({
  data, active, onAddParcel, incomingParcel, recentParcelId, riskPulse,
}) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const risks = useMemo(() => data.parcels.filter(isAtRisk), [data.parcels]);
  const leftCount = data.parcels.filter((parcel) => laneFor(parcel.weight_kg) === 'L').length;
  const rightCount = data.parcels.length - leftCount;
  const shouldAnimate = active && !hasAnimated;

  useEffect(() => {
    if (active && !hasAnimated) {
      const timer = window.setTimeout(() => setHasAnimated(true), 1100);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, hasAnimated]);

  const expectedBlocks = Array.from({ length: data.expected_today }, (_, index) => {
    const parcel = data.parcels[index];
    return {
      index,
      lane: parcel ? laneFor(parcel.weight_kg) : 'pending',
      key: parcel?.tag_uid ?? `pending-${index}`,
    };
  });

  return (
    <div className={`today-content${shouldAnimate ? ' today-content--opening' : ''}`}>
      <header className="today-intro">
        <h1 className="today-headline">
          <span className="headline-word"><span><CountUp value={data.parcels.length} active={active} className="num-blue" /> of</span></span>{' '}
          <span className="headline-word"><span>{data.expected_today}</span></span>{' '}
          <span className="headline-word"><span>parcels have</span></span>{' '}
          <span className="headline-word"><span>arrived.</span></span>
        </h1>
        <p className="today-subline">
          {Math.max(data.expected_today - data.parcels.length, 0)} more are expected today.
        </p>
      </header>

      <section className="belt-section" aria-label="Parcel arrival progress">
        <div className="belt-track">
          <div className="belt-row">
            {expectedBlocks.map((block) => (
              <span
                className={`belt-block belt-block--${block.lane}${block.key === recentParcelId ? ' belt-block--pop' : ''}`}
                key={block.key}
                style={{ '--block-delay': `${Math.min(block.index * 15, 660)}ms` }}
                aria-label={block.lane === 'L' ? 'Went left' : block.lane === 'R' ? 'Went right' : 'Still on its way'}
                title={block.lane === 'L' ? 'Went left' : block.lane === 'R' ? 'Went right' : 'Still on its way'}
              />
            ))}
          </div>
          {incomingParcel && (
            <div className={`arrival-motion arrival-motion--${laneFor(incomingParcel.weight_kg)}`} aria-hidden="true">
              <svg className="arrival-box" viewBox="0 0 24 24">
                <path d="m3 8 9-5 9 5v11l-9 4-9-4zM3 8l9 5 9-5M12 13v10M8 5l9 5" />
              </svg>
              <span className="sensor-flash" />
            </div>
          )}
        </div>
        <p className="belt-legend">
          <span className="legend-item"><i className="dot dot--blue" /> Blue went left</span>
          <span className="legend-item"><i className="dot dot--gold" /> Gold went right</span>
          <span className="legend-item"><i className="dot dot--grey" /> Grey is still on its way</span>
        </p>
      </section>

      <section className="stat-grid" aria-label="Parcel totals">
        <article className="card stat-card stat-card--left">
          <p className="stat-num"><CountUp value={leftCount} active={active} /></p>
          <p className="stat-label">Went left <span>(under 10 kg)</span></p>
        </article>
        <article className="card stat-card stat-card--right">
          <p className="stat-num"><CountUp value={rightCount} active={active} /></p>
          <p className="stat-label">Went right <span>(10 kg and over)</span></p>
        </article>
        <article className={`card stat-card stat-card--risk${riskPulse ? ' stat-card--shake' : ''}`}>
          <p className="stat-num"><CountUp value={risks.length} active={active} /></p>
          <p className="stat-label">May expire before they sell</p>
        </article>
      </section>

      <section className="attention-section">
        <h2 className="section-title">Needs your attention</h2>
        {risks.length ? risks.map((parcel) => (
          <article className="attention-card" key={parcel.tag_uid}>
            <p className="attention-product">{parcel.product}.</p>
            <p className="attention-detail">
              Expires in {parcel.expiry_in_days} days but predicted to sell in {parcel.predicted_sold_in_days} days.
            </p>
            <p className="attention-action">Sell this first.</p>
          </article>
        )) : <p className="attention-none">Nothing at risk right now.</p>}
      </section>

      <div className="simulate-row">
        <button className="btn btn--primary" type="button" onClick={onAddParcel} disabled={Boolean(incomingParcel)}>
          Simulate a new parcel
        </button>
        <span className="sim-tag">Demo only</span>
      </div>

      <section className="card sorting-card">
        <h2>How sorting works</h2>
        <ol className="sorting-steps">
          <li>A tag is scanned.</li>
          <li>A sensor confirms the parcel has arrived.</li>
          <li>Parcels under 10 kg go left; 10 kg or more goes right.</li>
          <li>Expiry dates and forecasts are simulated.</li>
        </ol>
      </section>
    </div>
  );
}
