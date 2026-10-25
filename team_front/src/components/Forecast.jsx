import { useMemo } from 'react';
import { CountUp } from './CountUp';

// Forecast shows the next seven simulated daily parcel totals as simple bars.
export function Forecast({ forecast, active }) {
  const busiest = useMemo(() => Math.max(...forecast.map((day) => day.count)), [forecast]);
  const tomorrow = forecast[1]?.count ?? 0;
  const points = forecast.map((day, index) => {
    const x = 50 + (index * 600) / Math.max(forecast.length - 1, 1);
    const y = 90 - (day.count / busiest) * 70;
    return `${index ? 'L' : 'M'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className={`forecast-content${active ? ' forecast-content--active' : ''}`}>
      <header className="tab-intro">
        <h1 className="forecast-headline">Tomorrow, expect about <span className="num-gold">{tomorrow}</span> parcels.</h1>
        <p className="tab-subline">Expected parcels per day. The forecast is simulated from past weekly patterns.</p>
      </header>
      <section className="card forecast-card" aria-label="Seven day parcel forecast">
        <div className="bar-chart" key={active ? 'open' : 'closed'}>
          {forecast.map((day, index) => (
            <div className="bar-col" key={day.day} tabIndex="0">
              <span className="bar-num"><CountUp value={day.count} active={active} /></span>
              <span className="bar-tooltip">about {day.count} parcels</span>
              <span
                className={`bar-fill${index === 0 ? ' bar-fill--today' : ''}${day.count === busiest ? ' bar-fill--busiest' : ''}`}
                style={{ '--bar-height': `${Math.max((day.count / busiest) * 100, 8)}%`, '--bar-delay': `${index * 60}ms` }}
                aria-label={`${day.day}: about ${day.count} parcels`}
              />
              <span className="bar-day">{day.day}</span>
            </div>
          ))}
          <svg className="forecast-line" viewBox="0 0 700 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={points} />
          </svg>
        </div>
        <p className="forecast-sim-note">Forecast amounts are simulated.</p>
      </section>
    </div>
  );
}
