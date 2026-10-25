// =============================================================
// DashboardApp — Owner application dashboard
// Features:
// - Manages parcels state, arrivals, and live stats
// - Tabs: Today, Parcels, Forecast
// - Support for initial filter (e.g. 'At risk' from landing hero)
// - Light/Dark theme toggle specifically for the dashboard
// - Smooth tab transitions
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import '../App.css';
import { fetchParcels } from '../data/api';
import { laneFor, isAtRisk, generateRandomParcel } from '../data/mock';
import { Compare } from './Compare';
import { Forecast } from './Forecast';
import { Nav } from './Nav';
import { Parcels } from './Parcels';
import { Toast } from './Toast';
import { Today } from './Today';

const TAB_IDS = ['today', 'parcels', 'forecast'];

function prefersDarkMode() {
  try {
    return window.localStorage.getItem('smart-warehouse-theme') === 'dark'
      || (!window.localStorage.getItem('smart-warehouse-theme')
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (error) {
    console.warn('The saved colour theme could not be read.', error);
    return false;
  }
}

export function DashboardApp({ currentTab = 'today', onTabChange, onGoHome, initialFilter }) {
  const [activeTab, setActiveTab] = useState(currentTab);
  const [data, setData] = useState(null);
  const [dark, setDark] = useState(prefersDarkMode);
  const [toastMessage, setToastMessage] = useState('');
  const [incomingParcel, setIncomingParcel] = useState(null);
  const [recentParcelId, setRecentParcelId] = useState(null);
  const [riskPulse, setRiskPulse] = useState(false);

  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);

  useEffect(() => {
    document.title = `Smart Warehouse · ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    fetchParcels().then((result) => {
      if (!cancelled) setData(result);
    }).catch((error) => {
      console.error('Could not load the warehouse demo data.', error);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      window.localStorage.setItem('smart-warehouse-theme', dark ? 'dark' : 'light');
    } catch (error) {
      console.warn('The colour theme could not be saved.', error);
    }
  }, [dark]);

  const changeTab = useCallback((nextTab) => {
    if (!TAB_IDS.includes(nextTab) || nextTab === activeTab) return;
    const direction = TAB_IDS.indexOf(nextTab) > TAB_IDS.indexOf(activeTab) ? 'right' : 'left';
    document.documentElement.dataset.tabDirection = direction;

    const update = () => flushSync(() => {
      setActiveTab(nextTab);
      if (onTabChange) onTabChange(nextTab);
      window.scrollTo(0, 0);
    });

    if (document.startViewTransition) {
      document.startViewTransition(update);
    } else {
      document.documentElement.dataset.tabFallback = 'true';
      update();
      window.setTimeout(() => {
        delete document.documentElement.dataset.tabFallback;
      }, 300);
    }
  }, [activeTab, onTabChange]);

  const addParcel = useCallback(() => {
    if (!data || incomingParcel) return;
    const parcel = generateRandomParcel();
    setIncomingParcel(parcel);
    window.setTimeout(() => {
      setData((current) => {
        if (!current || current.parcels.some((item) => item.tag_uid === parcel.tag_uid)) return current;
        const parcels = [parcel, ...current.parcels];
        const wentLeft = parcels.filter((item) => laneFor(item.weight_kg) === 'L').length;
        const wentRight = parcels.filter((item) => laneFor(item.weight_kg) === 'R').length;
        const atRisk = parcels.filter(isAtRisk).length;
        return {
          ...current,
          parcels,
          base_counts: { arrived: parcels.length, went_left: wentLeft, went_right: wentRight, at_risk: atRisk },
        };
      });
      setRecentParcelId(parcel.tag_uid);
      setIncomingParcel(null);
      setToastMessage(`${parcel.product}, ${parcel.weight_kg} kg, went ${laneFor(parcel.weight_kg) === 'L' ? 'left' : 'right'}.`);
      if (isAtRisk(parcel)) {
        setRiskPulse(true);
        window.setTimeout(() => setRiskPulse(false), 350);
      }
      window.setTimeout(() => setRecentParcelId(null), 1600);
    }, 550);
  }, [data, incomingParcel]);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.add('theme-changing');
    setDark((value) => !value);
    window.setTimeout(() => document.documentElement.classList.remove('theme-changing'), 350);
  }, []);

  const clearToast = useCallback(() => setToastMessage(''), []);

  if (!data) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="loading-note" role="status">Loading warehouse parcels…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Nav
        activeTab={activeTab}
        onTabChange={changeTab}
        onGoHome={onGoHome}
        dark={dark}
        onToggleDark={toggleTheme}
      />
      <main className="page-content">
        <div className="page-wrap">
          <section className="tab-panel" hidden={activeTab !== 'today'} aria-label="Today">
            <Today
              data={data}
              active={activeTab === 'today'}
              onAddParcel={addParcel}
              incomingParcel={incomingParcel}
              recentParcelId={recentParcelId}
              riskPulse={riskPulse}
            />
            <Compare />
          </section>

          <section className="tab-panel" hidden={activeTab !== 'parcels'} aria-label="Parcels">
            <Parcels
              parcels={data.parcels}
              active={activeTab === 'parcels'}
              recentParcelId={recentParcelId}
              initialFilter={initialFilter}
            />
          </section>

          <section className="tab-panel" hidden={activeTab !== 'forecast'} aria-label="Forecast">
            <Forecast forecast={data.forecast} active={activeTab === 'forecast'} />
          </section>
        </div>
      </main>

      <Toast message={toastMessage} onDone={clearToast} />
    </div>
  );
}
