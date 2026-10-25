import { useEffect, useMemo, useRef, useState } from 'react';
import { isAtRisk, laneFor } from '../data/mock';

const FILTERS = ['All', 'Left', 'Right', 'At risk'];

function filterParcels(parcels, search, filter) {
  const query = search.trim().toLowerCase();
  return parcels.filter((parcel) => {
    const matchesText = !query || parcel.product.toLowerCase().includes(query) || parcel.tag_uid.includes(query);
    const matchesFilter = filter === 'All'
      || (filter === 'Left' && laneFor(parcel.weight_kg) === 'L')
      || (filter === 'Right' && laneFor(parcel.weight_kg) === 'R')
      || (filter === 'At risk' && isAtRisk(parcel));
    return matchesText && matchesFilter;
  });
}

function formatDate(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(date);
}

// ParcelRow shows one parcel's lane, tag, expiry and simulated sell-by details.
function ParcelRow({ parcel, isNew, active, isRemoving, index }) {
  const rowRef = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || seen || isRemoving) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.08 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isRemoving, seen]);

  const lane = laneFor(parcel.weight_kg);
  return (
    <article
      ref={rowRef}
      className={`parcel-row${isNew ? ' parcel-row--new' : ''}${seen && active ? ' parcel-row--seen' : ''}${isRemoving ? ' parcel-row--removing' : ''}`}
      style={{ '--row-delay': `${Math.min(index * 40, 360)}ms` }}
      data-parcel-id={parcel.tag_uid}
      aria-hidden={isRemoving}
    >
      <div className="parcel-topline">
        <p className="parcel-product">{parcel.product}</p>
        <div className="parcel-tags">
          <span className={`lane-tag lane-tag--${lane}`}>{lane === 'L' ? 'Left lane' : 'Right lane'}</span>
          {isAtRisk(parcel) && <span className="risk-tag">May expire first</span>}
        </div>
      </div>
      <p className="parcel-meta">{parcel.weight_kg} kg · Tag {parcel.tag_uid}</p>
      <p className="parcel-meta">
        Expires {formatDate(parcel.expiry_in_days)} ({parcel.expiry_in_days} days) · Predicted to sell by {formatDate(parcel.predicted_sold_in_days)}
        <span className="sim-tag"> · Simulated prediction</span>
      </p>
    </article>
  );
}

// Parcels shows a searchable, filterable list of arrived stock.
export function Parcels({ parcels, active, recentParcelId, initialFilter }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter || 'All');
  const [exiting, setExiting] = useState([]);
  const [resultVersion, setResultVersion] = useState(0);
  const listRef = useRef(null);
  const exitTimer = useRef(null);
  const previousPositions = useRef(new Map());
  const previousResultVersion = useRef(0);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  const matched = useMemo(() => filterParcels(parcels, search, filter), [filter, parcels, search]);
  const matchedIds = useMemo(() => new Set(matched.map((parcel) => parcel.tag_uid)), [matched]);
  const exitingIds = useMemo(() => new Set(exiting.map((parcel) => parcel.tag_uid)), [exiting]);
  const renderedParcels = parcels.filter((parcel) => matchedIds.has(parcel.tag_uid) || exitingIds.has(parcel.tag_uid));

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  const updateResults = (nextSearch, nextFilter) => {
    if (nextSearch === search && nextFilter === filter) return;
    const nextIds = new Set(filterParcels(parcels, nextSearch, nextFilter).map((parcel) => parcel.tag_uid));
    const previous = new Map([...matched, ...exiting].map((parcel) => [parcel.tag_uid, parcel]));
    setExiting([...previous.values()].filter((parcel) => !nextIds.has(parcel.tag_uid)));
    setSearch(nextSearch);
    setFilter(nextFilter);
    setResultVersion((version) => version + 1);
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => setExiting([]), 160);
  };

  useEffect(() => {
    if (!active || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll('[data-parcel-id]')];
    const nextPositions = new Map();
    const resultsChanged = previousResultVersion.current !== resultVersion;
    rows.forEach((row) => {
      const id = row.dataset.parcelId;
      const previous = previousPositions.current.get(id);
      const nextTop = row.getBoundingClientRect().top;
      const matchesCurrentResults = matchedIds.has(id);
      if (matchesCurrentResults && typeof row.animate === 'function'
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && resultsChanged) {
        const movedBy = previous === undefined ? 0 : previous - nextTop;
        row.animate(
          [
            { opacity: 0, transform: `translateY(${movedBy + 4}px) scale(.985)` },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 150, easing: 'cubic-bezier(.22,1,.36,1)' },
        );
      } else if (matchesCurrentResults && previous !== undefined && previous !== nextTop
        && typeof row.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        row.animate(
          [{ transform: `translateY(${previous - nextTop}px)` }, { transform: 'translateY(0)' }],
          { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' },
        );
      }
      nextPositions.set(id, nextTop);
    });
    previousPositions.current = nextPositions;
    previousResultVersion.current = resultVersion;
  }, [active, exiting, filter, matched, matchedIds, resultVersion, search]);

  return (
    <div className="parcels-content">
      <header className="tab-intro">
        <h1 className="tab-headline">Parcels</h1>
        <p className="tab-subline">Find a parcel by product name or tag.</p>
      </header>
      <label className="search-label" htmlFor="parcel-search">Search parcels</label>
      <div className="search-wrap">
        <input
          id="parcel-search"
          className="search-box"
          type="search"
          placeholder="Product or tag number"
          value={search}
          onChange={(event) => updateResults(event.target.value, filter)}
        />
        {search && <button className="search-clear" type="button" onClick={() => updateResults('', filter)} aria-label="Clear search">×</button>}
      </div>
      <div className="filter-row" aria-label="Filter parcels">
        {FILTERS.map((item) => (
          <button
            className={`chip${filter === item ? ' chip--selected' : ''}`}
            type="button"
            key={item}
            aria-pressed={filter === item}
            onClick={() => updateResults(search, item)}
          >
            <span>{item}</span>
          </button>
        ))}
      </div>
      <div className="parcel-list" ref={listRef} aria-live="polite">
        {renderedParcels.map((parcel, index) => (
          <ParcelRow
            parcel={parcel}
            key={parcel.tag_uid}
            active={active}
            isNew={parcel.tag_uid === recentParcelId}
            isRemoving={exitingIds.has(parcel.tag_uid)}
            index={index}
          />
        ))}
        {!matched.length && <p className="card parcel-empty">No parcels match. Clear the search or pick another filter.</p>}
      </div>
    </div>
  );
}
