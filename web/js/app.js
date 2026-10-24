/**
 * Smart Warehouse IoT — Owner Dashboard Application
 * TRD Section 10 / Build Step 5
 * 
 * Features:
 * - Read-only public anon key usage
 * - Supabase Realtime subscriptions on arrival_events, batches, sell_estimates
 * - Screen 1 (Today): Forecast p10/p50/p90 vs Arrived today count
 * - Screen 2 (Stock): Batches, simulated expiry, estimated sell date, expiry risk flag
 * - Screen 3 (Live Feed): Realtime events (distinct ok, unknown_tag, duplicate)
 * - Automatic reconnection with visible status indicator
 * - Projector-ready high contrast UI with simulation labels
 */

(function () {
  'use strict';

  // ── Global App State ──────────────────────────────────────────
  let supabaseClient = null;
  let realtimeChannel = null;
  let reconnectTimer = null;
  let pollIntervalId = null;

  let state = {
    products: [],
    forecasts: [],
    batches: [],
    sellEstimates: new Map(), // batch_id -> estimate object
    arrivalEvents: [],
    feedFilter: 'all',
    activeScreen: 'screen-all',
    lastSync: null
  };

  // ── Configuration Resolution ──────────────────────────────────
  function resolveConfig() {
    const fromWindow = window.APP_CONFIG || {};
    const urlParams = new URLSearchParams(window.location.search);

    const supabaseUrl =
      urlParams.get('supabase_url') ||
      localStorage.getItem('sw_supabase_url') ||
      fromWindow.SUPABASE_URL ||
      '';

    const supabaseAnonKey =
      urlParams.get('supabase_anon_key') ||
      localStorage.getItem('sw_supabase_anon_key') ||
      fromWindow.SUPABASE_ANON_KEY ||
      '';

    const pollIntervalMs = fromWindow.POLL_INTERVAL_MS || 15000;

    return {
      supabaseUrl: supabaseUrl.trim().replace(/\/$/, ''),
      supabaseAnonKey: supabaseAnonKey.trim(),
      pollIntervalMs
    };
  }

  // ── DOM Elements ──────────────────────────────────────────────
  const el = {
    statusIndicator: document.getElementById('connectionStatus'),
    statusText: document.getElementById('connectionText'),
    lastSyncLabel: document.getElementById('lastSyncLabel'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnSettings: document.getElementById('btnSettings'),
    navTabs: document.querySelectorAll('.nav-tab'),
    screenViews: document.querySelectorAll('.screen-view'),
    
    // Screen 1: Today
    todayGrid: document.getElementById('todayProductsGrid'),
    statTodayUnits: document.getElementById('statTodayTotalUnits'),
    statTodayBatches: document.getElementById('statTodayTotalBatches'),

    // Screen 2: Stock
    stockTableBody: document.getElementById('stockTableBody'),
    statStockBatches: document.getElementById('statStockBatches'),
    statStockUnits: document.getElementById('statStockUnits'),
    statStockRisk: document.getElementById('statStockRisk'),

    // Screen 3: Feed
    liveFeedContainer: document.getElementById('liveFeedContainer'),
    feedUnreadBadge: document.getElementById('feedUnreadBadge'),
    filterChips: document.querySelectorAll('.filter-chip'),
    countFeedAll: document.getElementById('countFeedAll'),
    countFeedOk: document.getElementById('countFeedOk'),
    countFeedUnknown: document.getElementById('countFeedUnknown'),
    countFeedDuplicate: document.getElementById('countFeedDuplicate'),

    // Modal
    settingsModal: document.getElementById('settingsModal'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    cfgUrlInput: document.getElementById('cfgSupabaseUrl'),
    cfgKeyInput: document.getElementById('cfgAnonKey'),
    btnSaveConfig: document.getElementById('btnSaveConfig'),
    btnResetConfig: document.getElementById('btnResetConfig')
  };

  // ── Connection Status Helpers ─────────────────────────────────
  function setConnectionStatus(status, message) {
    el.statusIndicator.className = 'connection-indicator status-' + status;
    el.statusText.textContent = message;
  }

  // ── Initialize Supabase ───────────────────────────────────────
  function initSupabase() {
    const config = resolveConfig();

    if (!config.supabaseUrl || !config.supabaseAnonKey ||
        config.supabaseUrl.includes('YOUR_PROJECT_ID') ||
        config.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
      setConnectionStatus('offline', 'CONFIG REQUIRED');
      openSettingsModal();
      return false;
    }

    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      setConnectionStatus('offline', 'LIBRARY MISSING');
      console.error('[ERROR] @supabase/supabase-js library failed to load.');
      return false;
    }

    try {
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      console.log('[SUPABASE] Client initialized for', config.supabaseUrl);
      return true;
    } catch (err) {
      setConnectionStatus('offline', 'INIT FAILED');
      console.error('[ERROR] Supabase client init error:', err);
      return false;
    }
  }

  // ── Supabase Realtime Subscriptions ───────────────────────────
  function setupRealtime() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    setConnectionStatus('connecting', 'CONNECTING...');

    realtimeChannel = supabaseClient.channel('public:warehouse-ops');

    // 1. Listen to arrival_events (INSERT)
    realtimeChannel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'arrival_events' },
      (payload) => {
        console.log('[REALTIME] New Arrival Event:', payload.new);
        handleIncomingArrivalEvent(payload.new);
      }
    );

    // 2. Listen to batches (INSERT, UPDATE)
    realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'batches' },
      (payload) => {
        console.log('[REALTIME] Batch change:', payload);
        // Refresh stock & today counts on batch changes
        fetchBatchesAndEstimates();
      }
    );

    // 3. Listen to sell_estimates (INSERT, UPDATE)
    realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sell_estimates' },
      (payload) => {
        console.log('[REALTIME] Sell estimate change:', payload);
        fetchBatchesAndEstimates();
      }
    );

    // Track Channel Subscription Status
    realtimeChannel.subscribe((status, err) => {
      console.log('[REALTIME STATUS]', status, err || '');
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('live', '● LIVE (REALTIME)');
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        setConnectionStatus('connecting', 'RECONNECTING...');
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        setConnectionStatus('offline', 'DISCONNECTED');
        scheduleReconnect();
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    console.log('[REALTIME] Connection dropped. Reconnecting in 5 seconds...');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      setupRealtime();
      fetchAllData();
    }, 5000);
  }

  // ── Data Fetching ─────────────────────────────────────────────
  async function fetchAllData() {
    if (!supabaseClient) return;

    try {
      await Promise.all([
        fetchProducts(),
        fetchForecasts(),
        fetchBatchesAndEstimates(),
        fetchArrivalEvents()
      ]);
      state.lastSync = new Date();
      updateSyncLabel();
      renderAll();
    } catch (err) {
      console.error('[FETCH ERROR]', err);
      setConnectionStatus('offline', 'SYNC ERROR');
    }
  }

  async function fetchProducts() {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, category, weight_kg, shelf_life_days')
      .order('name');
    if (error) throw error;
    state.products = data || [];
  }

  async function fetchForecasts() {
    const todayStr = getTodayUtcIso();
    const { data, error } = await supabaseClient
      .from('forecasts')
      .select('forecast_date, product_id, p10, p50, p90, generated_at')
      .gte('forecast_date', todayStr)
      .order('forecast_date', { ascending: true });
    if (error) throw error;
    state.forecasts = data || [];
  }

  async function fetchBatchesAndEstimates() {
    const [batchesRes, estimatesRes] = await Promise.all([
      supabaseClient
        .from('batches')
        .select('id, product_id, tag_uid, quantity, simulated_mfg_date, simulated_expiry_date, arrived_at')
        .order('arrived_at', { ascending: false }),
      supabaseClient
        .from('sell_estimates')
        .select('batch_id, estimated_sell_date, expiry_risk, computed_at')
    ]);

    if (batchesRes.error) throw batchesRes.error;
    if (estimatesRes.error) throw estimatesRes.error;

    state.batches = batchesRes.data || [];
    state.sellEstimates = new Map();
    for (const est of (estimatesRes.data || [])) {
      state.sellEstimates.set(est.batch_id, est);
    }

    renderTodayScreen();
    renderStockScreen();
  }

  async function fetchArrivalEvents() {
    const { data, error } = await supabaseClient
      .from('arrival_events')
      .select('id, device_id, tag_uid, batch_id, result, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.arrivalEvents = data || [];
    renderFeedScreen();
  }

  // ── Realtime Event Handling ───────────────────────────────────
  function handleIncomingArrivalEvent(newEvent) {
    // Avoid duplicate insertions
    if (state.arrivalEvents.some(e => e.id === newEvent.id)) return;

    state.arrivalEvents.unshift(newEvent);
    if (state.arrivalEvents.length > 50) state.arrivalEvents.pop();

    renderFeedScreen(newEvent.id);

    // If event is OK, also trigger background refresh for Today & Stock
    if (newEvent.result === 'ok') {
      fetchBatchesAndEstimates();
    }
  }

  // ── Render All Screens ────────────────────────────────────────
  function renderAll() {
    renderTodayScreen();
    renderStockScreen();
    renderFeedScreen();
  }

  // ── Render Screen 1: Today ────────────────────────────────────
  function renderTodayScreen() {
    const todayStr = getTodayUtcIso();
    let totalArrivedTodayUnits = 0;
    let totalArrivedTodayBatches = 0;

    // Map of product_id -> { countUnits: N, countBatches: N }
    const arrivalsByProduct = new Map();
    for (const b of state.batches) {
      if (b.arrived_at && b.arrived_at.startsWith(todayStr)) {
        const cur = arrivalsByProduct.get(b.product_id) || { units: 0, batches: 0 };
        cur.units += b.quantity;
        cur.batches += 1;
        arrivalsByProduct.set(b.product_id, cur);
        totalArrivedTodayUnits += b.quantity;
        totalArrivedTodayBatches += 1;
      }
    }

    el.statTodayUnits.textContent = `${totalArrivedTodayUnits} units`;
    el.statTodayBatches.textContent = `(${totalArrivedTodayBatches} batches)`;

    if (state.products.length === 0) {
      el.todayGrid.innerHTML = '<div class="empty-state">No products found in database catalog.</div>';
      return;
    }

    let cardsHtml = '';
    for (const prod of state.products) {
      const arr = arrivalsByProduct.get(prod.id) || { units: 0, batches: 0 };

      // Find forecasts for this product
      const prodForecasts = state.forecasts.filter(f => f.product_id === prod.id);
      const todayForecast = prodForecasts.find(f => f.forecast_date === todayStr);

      const p50Val = todayForecast ? Number(todayForecast.p50).toFixed(1) : 'N/A';
      const p10Val = todayForecast ? Number(todayForecast.p10).toFixed(1) : '—';
      const p90Val = todayForecast ? Number(todayForecast.p90).toFixed(1) : '—';

      // Upcoming multi-day timeline (next 4 days)
      const nextDays = prodForecasts.slice(0, 4);
      let timelineHtml = '';
      if (nextDays.length > 0) {
        timelineHtml = `
          <div class="forecast-timeline">
            <div class="timeline-title">
              <span>Forecast Horizon</span>
              <span class="sim-label-pill">SIMULATED DEMAND</span>
            </div>
            <div class="timeline-days">
              ${nextDays.map(d => `
                <div class="timeline-day-col">
                  <div class="timeline-date">${formatShortDate(d.forecast_date)}</div>
                  <div class="timeline-p50">${Number(d.p50).toFixed(0)}</div>
                  <div class="timeline-band">${Number(d.p10).toFixed(0)}–${Number(d.p90).toFixed(0)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        timelineHtml = `
          <div class="forecast-timeline">
            <div class="timeline-title">
              <span>Forecast Horizon</span>
              <span class="sim-label-pill">SIMULATED DEMAND</span>
            </div>
            <p style="font-size: 11px; color: var(--text-faint);">No upcoming daily forecasts loaded.</p>
          </div>
        `;
      }

      cardsHtml += `
        <article class="product-card">
          <div class="product-card-top">
            <div>
              <h3 class="product-name">${escapeHtml(prod.name)}</h3>
              <span class="sim-label-pill">CATALOG: ${prod.weight_kg} kg (SIMULATED)</span>
            </div>
            <span class="category-tag">${escapeHtml(prod.category)}</span>
          </div>

          <div class="comparison-grid">
            <div class="metric-box">
              <span class="metric-label">Arrived Today</span>
              <span class="metric-huge highlight-green">${arr.units}</span>
              <span class="metric-sub">${arr.batches} batch(es) arrived</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Forecast Demand (p50)</span>
              <span class="metric-huge highlight-blue">${p50Val}</span>
              <span class="band-strip">p10–p90: ${p10Val} – ${p90Val} (SIM)</span>
            </div>
          </div>

          ${timelineHtml}
        </article>
      `;
    }

    el.todayGrid.innerHTML = cardsHtml;
  }

  // ── Render Screen 2: Stock ────────────────────────────────────
  function renderStockScreen() {
    el.statStockBatches.textContent = state.batches.length;
    const totalStockUnits = state.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
    el.statStockUnits.textContent = `${totalStockUnits} units`;

    let highRiskCount = 0;
    for (const est of state.sellEstimates.values()) {
      if (est.expiry_risk === true) highRiskCount++;
    }
    el.statStockRisk.textContent = highRiskCount;
    el.statStockRisk.className = highRiskCount > 0 ? 'stat-val highlight-red' : 'stat-val highlight-green';

    if (state.batches.length === 0) {
      el.stockTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <span class="empty-icon">📦</span>
            <h3>No Warehouse Batches Found</h3>
            <p>Scan parcels at the ESP32 scan station to record stock batches.</p>
          </td>
        </tr>
      `;
      return;
    }

    const prodMap = new Map(state.products.map(p => [p.id, p]));

    let rowsHtml = '';
    for (const b of state.batches) {
      const prod = prodMap.get(b.product_id);
      const prodName = prod ? prod.name : 'Unknown Product';
      const prodCat = prod ? prod.category : '';
      const est = state.sellEstimates.get(b.id);

      // Expiry Risk Badge
      let riskBadge = '<span class="badge-risk risk-pending">⚪ Pending Calc</span>';
      if (est) {
        if (est.expiry_risk === true) {
          riskBadge = '<span class="badge-risk risk-high">⚠️ HIGH RISK</span>';
        } else if (est.expiry_risk === false) {
          riskBadge = '<span class="badge-risk risk-low">✓ On Track</span>';
        }
      }

      const estSellDate = est && est.estimated_sell_date
        ? est.estimated_sell_date
        : '<span style="color: var(--text-faint); font-size:12px;">Not calculated (deferred)</span>';

      rowsHtml += `
        <tr>
          <td>
            <div class="col-prod">${escapeHtml(prodName)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(prodCat)}</div>
          </td>
          <td class="col-tag">${escapeHtml(b.tag_uid)}</td>
          <td class="col-qty">${b.quantity} units</td>
          <td class="col-time" title="${b.arrived_at}">
            ${formatDateTime(b.arrived_at)}
          </td>
          <td>
            <div style="font-family: var(--font-mono); font-weight:700;">${b.simulated_expiry_date}</div>
            <span class="sim-label-pill">SIMULATED EXPIRY</span>
          </td>
          <td style="font-family: var(--font-mono);">${estSellDate}</td>
          <td>${riskBadge}</td>
        </tr>
      `;
    }

    el.stockTableBody.innerHTML = rowsHtml;
  }

  // ── Render Screen 3: Live Feed ────────────────────────────────
  function renderFeedScreen(newestEventId) {
    const filter = state.feedFilter;
    let okCount = 0;
    let unkCount = 0;
    let dupCount = 0;

    for (const ev of state.arrivalEvents) {
      if (ev.result === 'ok') okCount++;
      else if (ev.result === 'unknown_tag') unkCount++;
      else if (ev.result === 'duplicate') dupCount++;
    }

    el.countFeedAll.textContent = state.arrivalEvents.length;
    el.countFeedOk.textContent = okCount;
    el.countFeedUnknown.textContent = unkCount;
    el.countFeedDuplicate.textContent = dupCount;

    const filteredEvents = state.arrivalEvents.filter(ev => {
      if (filter === 'all') return true;
      return ev.result === filter;
    });

    if (filteredEvents.length === 0) {
      el.liveFeedContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📡</span>
          <h3>No Events in Filter '${filter.toUpperCase()}'</h3>
          <p>Scan a tag at the ESP32 station or trigger the backend test script.</p>
        </div>
      `;
      return;
    }

    let itemsHtml = '';
    for (const ev of filteredEvents) {
      const isNew = ev.id === newestEventId;
      const resultClass = 'result-' + (ev.result || 'ok');

      let badgeLabel = 'OK / ARRIVED';
      if (ev.result === 'unknown_tag') badgeLabel = 'UNKNOWN TAG';
      else if (ev.result === 'duplicate') badgeLabel = 'DUPLICATE (COOLDOWN)';

      itemsHtml += `
        <div class="feed-item ${resultClass} ${isNew ? 'new-arrival' : ''}">
          <div class="feed-left">
            <span class="result-badge">${badgeLabel}</span>
            <div class="feed-details">
              <span class="feed-tag">Tag: ${escapeHtml(ev.tag_uid)}</span>
              <span class="feed-device">Device: ${escapeHtml(ev.device_id || 'unknown')} ${ev.batch_id ? '• Batch Created' : ''}</span>
            </div>
          </div>
          <div class="feed-time">
            <div>${formatDateTime(ev.created_at)}</div>
            <div style="font-size: 11px; color: var(--text-faint);">${timeAgo(ev.created_at)}</div>
          </div>
        </div>
      `;
    }

    el.liveFeedContainer.innerHTML = itemsHtml;
  }

  // ── Navigation & Screen Toggle ────────────────────────────────
  function setupNavigation() {
    el.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        el.navTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetScreen = tab.dataset.screen;
        state.activeScreen = targetScreen;

        if (targetScreen === 'screen-all') {
          document.body.classList.add('mode-all');
          el.screenViews.forEach(v => v.classList.remove('view-active'));
        } else {
          document.body.classList.remove('mode-all');
          el.screenViews.forEach(v => {
            if (v.id === targetScreen) {
              v.classList.add('view-active');
            } else {
              v.classList.remove('view-active');
            }
          });
        }
      });
    });

    // Feed Filter Chips
    el.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        el.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.feedFilter = chip.dataset.filter;
        renderFeedScreen();
      });
    });

    // Refresh Button
    el.btnRefresh.addEventListener('click', () => {
      fetchAllData();
    });

    // Settings Modal
    el.btnSettings.addEventListener('click', openSettingsModal);
    el.btnCloseSettings.addEventListener('click', closeSettingsModal);
    el.btnSaveConfig.addEventListener('click', saveSettingsModal);
    el.btnResetConfig.addEventListener('click', resetSettingsModal);
  }

  function openSettingsModal() {
    const config = resolveConfig();
    el.cfgUrlInput.value = config.supabaseUrl;
    el.cfgKeyInput.value = config.supabaseAnonKey;
    el.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    el.settingsModal.classList.add('hidden');
  }

  function saveSettingsModal() {
    const url = el.cfgUrlInput.value.trim().replace(/\/$/, '');
    const key = el.cfgKeyInput.value.trim();

    if (!url || !key) {
      alert('Please enter both Supabase Project URL and Public Anon Key.');
      return;
    }

    localStorage.setItem('sw_supabase_url', url);
    localStorage.setItem('sw_supabase_anon_key', key);
    closeSettingsModal();

    // Re-initialize and reconnect
    if (initSupabase()) {
      setupRealtime();
      fetchAllData();
    }
  }

  function resetSettingsModal() {
    if (confirm('Reset stored Supabase configuration in localStorage?')) {
      localStorage.removeItem('sw_supabase_url');
      localStorage.removeItem('sw_supabase_anon_key');
      closeSettingsModal();
      window.location.reload();
    }
  }

  // ── Date and Utility Helpers ──────────────────────────────────
  function getTodayUtcIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
             ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
    } catch {
      return isoString;
    }
  }

  function formatShortDate(isoDateStr) {
    if (!isoDateStr) return '';
    try {
      const parts = isoDateStr.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
    } catch {
      return isoDateStr;
    }
  }

  function timeAgo(isoString) {
    if (!isoString) return '';
    const now = Date.now();
    const past = new Date(isoString).getTime();
    const diffSec = Math.floor((now - past) / 1000);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }

  function updateSyncLabel() {
    if (state.lastSync) {
      el.lastSyncLabel.textContent = state.lastSync.toLocaleTimeString();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Start Application ─────────────────────────────────────────
  function start() {
    setupNavigation();
    document.body.classList.add('mode-all'); // default to Projector Mode

    const ok = initSupabase();
    if (ok) {
      setupRealtime();
      fetchAllData();

      // Background Polling Backup
      const config = resolveConfig();
      pollIntervalId = setInterval(() => {
        console.log('[POLL] Background data sync...');
        fetchAllData();
      }, config.pollIntervalMs);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
