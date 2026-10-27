/**
 * Smart Warehouse IoT — Unified Owner Operations Dashboard & Landing Application
 *
 * Merges:
 * 1. Front door Landing Page (Hero typewriter, Marquee strip, MiniBelt 2D canvas simulation,
 *    WhyUs comparison, WhoItsFor audience tabs, HowItWorks workflow, DashboardPreview,
 *    Team & Tech, FAQ accordion, Footer)
 * 2. Real-time Operations Dashboard (Today arrival progress, Conveyor visualizer,
 *    Urgent stock attention cards, Parcels & Stock with dual Card/Table views,
 *    7-Day Forecast bar chart with trend line, Realtime Live Feed, Projector mode)
 * 3. Supabase Realtime data layer with auto-reconnect, dark/light theme, and config modal.
 */

(function () {
  'use strict';

  // ── Global State ──────────────────────────────────────────────
  let supabaseClient = null;
  let realtimeChannel = null;
  let reconnectTimer = null;
  let pollIntervalId = null;
  let toastTimer = null;
  let typewriterTimer = null;
  let miniBeltAnimationId = null;

  const state = {
    products: [],
    forecasts: [],
    batches: [],
    sellEstimates: new Map(), // batch_id -> estimate object
    arrivalEvents: [],
    activeTab: 'home', // 'home' | 'today' | 'parcels' | 'forecast' | 'feed' | 'projector'
    parcelFilter: 'all',
    parcelSearch: '',
    parcelView: 'cards', // 'cards' | 'table'
    feedFilter: 'all',
    theme: 'dark',
    expectedToday: 40,
    recentParcelId: null,
    isIncomingMotion: false,
    audience: 'shops'
  };

  // ── Config Resolution ──────────────────────────────────────────
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

  // ── Pure Logic / Helper Functions (Exported for Unit Tests) ───
  const helpers = {
    laneFor(weightKg) {
      const num = Number(weightKg);
      if (isNaN(num)) return 'L';
      return num >= 10 ? 'R' : 'L';
    },

    isAtRisk(estimate, batch) {
      if (!estimate) return false;
      if (estimate.expiry_risk === true) return true;
      if (estimate.estimated_sell_date && batch && batch.simulated_expiry_date) {
        return estimate.estimated_sell_date > batch.simulated_expiry_date;
      }
      return false;
    },

    getTodayUtcIso() {
      return new Date().toISOString().slice(0, 10);
    },

    formatDateTime(isoString) {
      if (!isoString) return '—';
      try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
               ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
      } catch {
        return isoString;
      }
    },

    formatShortDate(isoDateStr) {
      if (!isoDateStr) return '';
      try {
        const parts = isoDateStr.split('-');
        if (parts.length < 3) return isoDateStr;
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      } catch {
        return isoDateStr;
      }
    },

    timeAgo(isoString, now = Date.now()) {
      if (!isoString) return '';
      try {
        const past = new Date(isoString).getTime();
        const diffSec = Math.floor((now - past) / 1000);
        if (diffSec < 5) return 'just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        return `${diffHr}h ago`;
      } catch {
        return '';
      }
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    filterBatches(batches, productsMap, search, filter, estimatesMap) {
      if (!Array.isArray(batches)) return [];
      const query = (search || '').trim().toLowerCase();

      return batches.filter(batch => {
        const prod = productsMap.get(batch.product_id) || {};
        const prodName = (prod.name || '').toLowerCase();
        const prodCat = (prod.category || '').toLowerCase();
        const tag = (batch.tag_uid || '').toLowerCase();

        const matchesSearch = !query ||
          prodName.includes(query) ||
          prodCat.includes(query) ||
          tag.includes(query);

        if (!matchesSearch) return false;

        const weight = prod.weight_kg !== undefined ? prod.weight_kg : 2.0;
        const lane = helpers.laneFor(weight);
        const est = estimatesMap ? estimatesMap.get(batch.id) : null;
        const atRisk = helpers.isAtRisk(est, batch);

        if (filter === 'all') return true;
        if (filter === 'left') return lane === 'L';
        if (filter === 'right') return lane === 'R';
        if (filter === 'risk') return atRisk;
        return true;
      });
    }
  };

  window.WarehouseApp = helpers;

  // ── DOM Cache ──────────────────────────────────────────────────
  const el = {};

  function initElements() {
    el.siteHeader = document.getElementById('siteHeader');
    el.mobileNav = document.querySelector('.main-nav--mobile');
    el.btnHeaderGoHome = document.getElementById('btnHeaderGoHome');
    el.connectionStatus = document.getElementById('connectionStatus');
    el.connectionText = document.getElementById('connectionText');
    el.btnRefresh = document.getElementById('btnRefresh');
    el.btnSettings = document.getElementById('btnSettings');
    el.btnThemeToggle = document.getElementById('btnThemeToggle');
    el.themeToggleIcon = document.getElementById('themeToggleIcon');
    el.brandLogo = document.getElementById('brandLogo');

    // Nav pills & tabs
    el.desktopNavPill = document.getElementById('desktopNavPill');
    el.mobileNavPill = document.getElementById('mobileNavPill');
    el.navTabs = document.querySelectorAll('.nav-tab');
    el.tabPanels = document.querySelectorAll('.tab-panel');

    // Landing Nav & Elements
    el.landingNavWrap = document.getElementById('landingNavWrap');
    el.landingLogoHome = document.getElementById('landingLogoHome');
    el.btnProductDropdown = document.getElementById('btnProductDropdown');
    el.productDropdownMenu = document.getElementById('productDropdownMenu');
    el.btnLandingNavDashboard = document.getElementById('btnLandingNavDashboard');
    el.btnLandingOpenDashboard = document.getElementById('btnLandingOpenDashboard');
    el.btnMobileHamburger = document.getElementById('btnMobileHamburger');
    el.mobileDrawer = document.getElementById('mobileDrawer');
    el.btnDrawerOpenDashboard = document.getElementById('btnDrawerOpenDashboard');
    el.heroTypewriterText = document.getElementById('heroTypewriterText');
    el.btnHeroOpenDashboard = document.getElementById('btnHeroOpenDashboard');
    el.quickCardToday = document.getElementById('quickCardToday');
    el.quickCardTodaySub = document.getElementById('quickCardTodaySub');
    el.quickCardRisk = document.getElementById('quickCardRisk');
    el.quickCardForecast = document.getElementById('quickCardForecast');
    el.miniBeltCanvas = document.getElementById('miniBeltCanvas');
    el.miniBeltCanvasWrap = document.getElementById('miniBeltCanvasWrap');
    el.canvasLeftCount = document.getElementById('canvasLeftCount');
    el.canvasRightCount = document.getElementById('canvasRightCount');
    el.btnDropCanvasBox = document.getElementById('btnDropCanvasBox');
    el.whoTabBtns = document.querySelectorAll('.who-tab-btn');
    el.whoCardsContainer = document.getElementById('whoCardsContainer');
    el.previewHeadlineNum = document.getElementById('previewHeadlineNum');
    el.previewStatLeft = document.getElementById('previewStatLeft');
    el.previewStatRight = document.getElementById('previewStatRight');
    el.previewStatRisk = document.getElementById('previewStatRisk');
    el.btnPreviewOpenLive = document.getElementById('btnPreviewOpenLive');
    el.faqAccordionList = document.getElementById('faqAccordionList');
    el.btnFooterOpenDashboard = document.getElementById('btnFooterOpenDashboard');
    el.footerLinkToday = document.getElementById('footerLinkToday');
    el.footerLinkParcels = document.getElementById('footerLinkParcels');
    el.footerLinkForecast = document.getElementById('footerLinkForecast');

    // Tab 1: Today
    el.headlineCountArrived = document.getElementById('headlineCountArrived');
    el.headlineCountExpected = document.getElementById('headlineCountExpected');
    el.headlineSubline = document.getElementById('headlineSubline');
    el.beltRowContainer = document.getElementById('beltRowContainer');
    el.arrivalMotionEl = document.getElementById('arrivalMotionEl');
    el.statLeftCount = document.getElementById('statLeftCount');
    el.statRightCount = document.getElementById('statRightCount');
    el.statRiskCount = document.getElementById('statRiskCount');
    el.statRiskCard = document.getElementById('statRiskCard');
    el.attentionCardsContainer = document.getElementById('attentionCardsContainer');
    el.todayProductsGrid = document.getElementById('todayProductsGrid');
    el.btnSimulateParcel = document.getElementById('btnSimulateParcel');

    // Tab 2: Parcels / Stock
    el.btnViewCards = document.getElementById('btnViewCards');
    el.btnViewTable = document.getElementById('btnViewTable');
    el.parcelSearchInput = document.getElementById('parcelSearchInput');
    el.btnSearchClear = document.getElementById('btnSearchClear');
    el.parcelsCardsContainer = document.getElementById('parcelsCardsContainer');
    el.parcelsTableContainer = document.getElementById('parcelsTableContainer');
    el.stockTableBody = document.getElementById('stockTableBody');
    el.countFilterAll = document.getElementById('countFilterAll');
    el.parcelChips = document.querySelectorAll('#panel-parcels .filter-row .chip');

    // Tab 3: Forecast
    el.forecastTomorrowCount = document.getElementById('forecastTomorrowCount');
    el.forecastBarChart = document.getElementById('forecastBarChart');

    // Tab 4: Live Feed
    el.liveFeedContainer = document.getElementById('liveFeedContainer');
    el.countFeedAll = document.getElementById('countFeedAll');
    el.countFeedOk = document.getElementById('countFeedOk');
    el.countFeedUnknown = document.getElementById('countFeedUnknown');
    el.countFeedDuplicate = document.getElementById('countFeedDuplicate');
    el.feedChips = document.querySelectorAll('#panel-feed .filter-row .chip');

    // Tab 5: Projector
    el.projectorTodayContainer = document.getElementById('projectorTodayContainer');
    el.projectorFeedContainer = document.getElementById('projectorFeedContainer');

    // Toast
    el.toastContainer = document.getElementById('toastContainer');
    el.toastMessage = document.getElementById('toastMessage');

    // Settings Modal
    el.settingsModal = document.getElementById('settingsModal');
    el.btnCloseSettings = document.getElementById('btnCloseSettings');
    el.cfgSupabaseUrl = document.getElementById('cfgSupabaseUrl');
    el.cfgAnonKey = document.getElementById('cfgAnonKey');
    el.btnSaveConfig = document.getElementById('btnSaveConfig');
    el.btnResetConfig = document.getElementById('btnResetConfig');
  }

  // ── Connection Status ──────────────────────────────────────────
  function setConnectionStatus(status, label) {
    if (!el.connectionStatus || !el.connectionText) return;
    el.connectionStatus.className = `conn-indicator conn--${status}`;
    el.connectionText.textContent = label;
  }

  // ── Theme Manager ──────────────────────────────────────────────
  function initTheme() {
    let savedTheme = localStorage.getItem('smart-warehouse-theme');
    if (!savedTheme) {
      savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('smart-warehouse-theme', theme);
    if (el.themeToggleIcon) {
      el.themeToggleIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // ── Toast Notifications ────────────────────────────────────────
  function showToast(message) {
    if (!el.toastContainer || !el.toastMessage) return;
    if (toastTimer) clearTimeout(toastTimer);

    el.toastMessage.textContent = message;
    el.toastContainer.style.display = 'block';

    toastTimer = setTimeout(() => {
      el.toastContainer.style.display = 'none';
      toastTimer = null;
    }, 2800);
  }

  // ── Landing Page Widgets & Interactions ────────────────────────
  const FEED_EVENTS = [
    'Tag 0AEFF505 scanned: Chips, 2.0 kg. Sent to the left lane.',
    'Flour sack (20 kg) may expire before it sells. Flagged to sell first.',
    'Tag 55667791 scanned: Cooking oil, 12.0 kg. Sent to the right lane.',
    'Infrared beam confirmed box arrival at intake conveyor gate.',
    'Green Tea at risk: simulated expiry in 3 days, predicted sold in 6 days.',
    'AI forecast updated: 38 parcels expected tomorrow.'
  ];

  function initLandingTypewriter() {
    let lineIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function tick() {
      const currentLine = FEED_EVENTS[lineIdx];

      if (!isDeleting && charIdx <= currentLine.length) {
        if (el.heroTypewriterText) {
          el.heroTypewriterText.textContent = currentLine.slice(0, charIdx);
        }
        charIdx++;
        if (charIdx > currentLine.length) {
          typewriterTimer = setTimeout(() => {
            isDeleting = true;
            tick();
          }, 2400);
          return;
        }
        typewriterTimer = setTimeout(tick, 35);
      } else if (isDeleting && charIdx > 0) {
        charIdx--;
        if (el.heroTypewriterText) {
          el.heroTypewriterText.textContent = currentLine.slice(0, charIdx);
        }
        typewriterTimer = setTimeout(tick, 18);
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        lineIdx = (lineIdx + 1) % FEED_EVENTS.length;
        typewriterTimer = setTimeout(tick, 400);
      }
    }

    tick();
  }

  // MiniBelt 2D Canvas Interactive Physics Simulation
  let spawnCanvasBoxFn = null;

  function initMiniBeltCanvas() {
    const canvas = el.miniBeltCanvas;
    const container = el.miniBeltCanvasWrap;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = 220);

    const onResize = () => {
      if (!container) return;
      width = canvas.width = container.clientWidth;
      height = canvas.height = 220;
    };
    window.addEventListener('resize', onResize);

    const beltY = 120;
    let gateX = width * 0.48;
    let forkX = gateX + 50;

    let canvasBoxes = [
      { x: 30, y: beltY - 22, w: 32, h: 22, weight: 2.0, lane: 'L', scanned: false, flash: 0 },
      { x: 180, y: beltY - 28, w: 42, h: 28, weight: 16.0, lane: 'R', scanned: false, flash: 0 }
    ];

    let leftCount = 14;
    let rightCount = 8;

    function spawnBox(customX, customWeight) {
      const weight = customWeight || (Math.random() > 0.5 ? 1 + Math.random() * 8 : 10 + Math.random() * 15);
      const isL = helpers.laneFor(weight) === 'L';
      const size = Math.max(26, Math.min(46, 22 + (weight / 25) * 22));
      canvasBoxes.push({
        x: customX !== undefined ? customX : 10,
        y: 20,
        w: size,
        h: size * 0.72,
        weight: Math.round(weight * 10) / 10,
        lane: isL ? 'L' : 'R',
        scanned: false,
        flash: 0,
        dropping: true
      });
    }

    spawnCanvasBoxFn = spawnBox;

    const autoSpawnInterval = setInterval(() => {
      if (state.activeTab === 'home' && canvasBoxes.length < 5) {
        spawnBox(15);
      }
    }, 2400);

    let treadOffset = 0;

    function loop() {
      if (state.activeTab !== 'home') {
        miniBeltAnimationId = requestAnimationFrame(loop);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      gateX = width * 0.48;
      forkX = gateX + 50;
      treadOffset = (treadOffset + 1.6) % 20;

      // Infeed conveyor belt
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, beltY, forkX, 14);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, beltY, forkX, 14);

      // Treads
      ctx.strokeStyle = '#282828';
      ctx.lineWidth = 1.5;
      for (let x = treadOffset; x < forkX; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, beltY + 1);
        ctx.lineTo(x, beltY + 13);
        ctx.stroke();
      }

      // Upper Belt (Left Lane)
      ctx.fillStyle = '#181818';
      ctx.fillRect(forkX, beltY, width - forkX - 70, 14);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(forkX, beltY, width - forkX - 70, 14);

      // Lower Chute (Right Lane)
      ctx.save();
      ctx.translate(forkX, beltY + 14);
      ctx.rotate(0.38);
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, width - forkX - 80, 12);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(0, 0, width - forkX - 80, 12);
      ctx.restore();

      // IR Sensor Gate
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gateX - 10, beltY + 14);
      ctx.lineTo(gateX - 10, beltY - 45);
      ctx.lineTo(gateX + 10, beltY - 45);
      ctx.lineTo(gateX + 10, beltY + 14);
      ctx.stroke();

      // Red laser beam
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gateX - 8, beltY - 32);
      ctx.lineTo(gateX + 8, beltY - 32);
      ctx.stroke();

      // Lane Bins
      ctx.strokeStyle = '#2547D0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(width - 65, beltY - 18, 55, 42);
      ctx.fillStyle = 'rgba(37, 71, 208, 0.12)';
      ctx.fillRect(width - 65, beltY - 18, 55, 42);
      ctx.fillStyle = '#8EA4FF';
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LEFT', width - 38, beltY + 6);

      ctx.strokeStyle = '#F2A900';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(width - 65, height - 52, 55, 42);
      ctx.fillStyle = 'rgba(242, 169, 0, 0.12)';
      ctx.fillRect(width - 65, height - 52, 55, 42);
      ctx.fillStyle = '#FFC733';
      ctx.fillText('RIGHT', width - 38, height - 28);

      // Boxes Loop
      for (let i = canvasBoxes.length - 1; i >= 0; i--) {
        const b = canvasBoxes[i];

        if (b.dropping) {
          b.y += 3.5;
          if (b.y >= beltY - b.h) {
            b.y = beltY - b.h;
            b.dropping = false;
          }
        } else {
          b.x += 1.8;

          if (!b.scanned && b.x + b.w / 2 >= gateX - 8 && b.x + b.w / 2 <= gateX + 8) {
            b.scanned = true;
            b.flash = 8;
          }

          if (b.x > forkX && b.lane === 'R') {
            b.y += 0.72;
          }
        }

        ctx.save();
        const flashColor = b.flash > 0 ? '#FFFFFF' : (b.lane === 'L' ? '#8EA4FF' : '#FFC733');
        if (b.flash > 0) b.flash--;

        ctx.fillStyle = b.flash > 0 ? '#FFFFFF' : '#B87333';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = flashColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        ctx.fillStyle = '#111';
        ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, 12);
        ctx.fillStyle = '#FFF';
        ctx.font = '700 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${b.weight} kg`, b.x + b.w / 2, b.y + 12);
        ctx.restore();

        if (b.x >= width - 65) {
          if (b.lane === 'L') {
            leftCount++;
            if (el.canvasLeftCount) el.canvasLeftCount.textContent = String(leftCount).padStart(2, '0');
          } else {
            rightCount++;
            if (el.canvasRightCount) el.canvasRightCount.textContent = String(rightCount).padStart(2, '0');
          }
          canvasBoxes.splice(i, 1);
        }
      }

      miniBeltAnimationId = requestAnimationFrame(loop);
    }

    miniBeltAnimationId = requestAnimationFrame(loop);
  }

  // Audience Tabs (Who It's For)
  const AUDIENCES = {
    shops: [
      { icon: '🏪', title: 'Runs on your phone', desc: 'Check arrived stock from the shop counter without needing a laptop or dedicated workstation.' },
      { icon: '🏷️', title: 'Zero barcode scanning', desc: 'Boxes are detected as delivery drivers wheel them through the door, freeing staff for customers.' },
      { icon: '⏰', title: 'Never lose stock to expiry', desc: 'Get an early heads-up when slow-selling items risk spoiling before customer demand catches up.' }
    ],
    distributors: [
      { icon: '🚚', title: 'Automated weight sorting', desc: 'Heavy wholesale crates (≥ 10 kg) are split immediately from lightweight cartons for pallet staging.' },
      { icon: '📊', title: 'Daily arrival pacing', desc: 'Compare incoming truck manifests with real sensor intake counts to spot shortages instantly.' },
      { icon: '☁️', title: 'Synced cloud history', desc: 'Every tag and physical timestamp is stored in a clean cloud database with zero manual data entry.' }
    ],
    grocery: [
      { icon: '🥛', title: 'First-to-expire warnings', desc: 'Clear red alerts highlight dairy, produce, and fresh juices that must be placed on shelves first.' },
      { icon: '❄️', title: 'Hands-free intake', desc: 'Keep cold-chain deliveries moving quickly into walk-in chillers without manual barcode checks.' },
      { icon: '📈', title: 'Demand forecasting', desc: 'Plan weekly perishables orders using historical weekday intake trends rather than guesswork.' }
    ],
    pharmacies: [
      { icon: '💊', title: 'Shelf-life compliance', desc: 'Automatically flag medical supplies when predicted dispense rates lag behind manufacturer expiry.' },
      { icon: '🛡️', title: 'Physical receipt proof', desc: 'The infrared sensor confirms the parcel physically crossed the intake portal, eliminating entry errors.' },
      { icon: '📋', title: 'Simple plain-language logs', desc: 'No cryptic SKU codes or tech jargon—staff see clear product names and arrival times.' }
    ]
  };

  function renderAudienceCards(audienceKey) {
    if (!el.whoCardsContainer) return;
    const cards = AUDIENCES[audienceKey] || AUDIENCES.shops;
    el.whoCardsContainer.innerHTML = cards.map(c => `
      <div class="who-card">
        <div class="who-card-icon">${c.icon}</div>
        <h3 class="who-card-title">${helpers.escapeHtml(c.title)}</h3>
        <p class="who-card-desc">${helpers.escapeHtml(c.desc)}</p>
      </div>
    `).join('');
  }

  // FAQ Accordion
  const FAQS = [
    {
      q: 'Is the data real?',
      a: 'The physical hardware events (RFID scans, infrared beam triggers, and servo gate sorting) are real. Expiry dates, sell-by predictions, and the 7-day arrival forecast use simulated data models for demonstration purposes.'
    },
    {
      q: 'Can it use my existing products?',
      a: 'Yes. Standard passive RFID sticker tags can be applied to any existing cardboard cartons, plastic crates, or packaging. No expensive proprietary tags are required.'
    },
    {
      q: 'What if the sensor misses a box?',
      a: 'The app compares expected deliveries against the sensor intake count. If a parcel is scanned by RFID but fails to trigger the infrared arrival sensor, a mismatch is instantly highlighted on the Today dashboard.'
    },
    {
      q: 'Do I need special equipment?',
      a: 'No. The entire sorting station runs on an inexpensive ESP32 microcontroller, standard hobby servo, and cheap IR diodes. The owner app runs directly inside any web browser on iOS, Android, macOS, or Windows.'
    },
    {
      q: 'What does it cost to build?',
      a: 'The complete hardware assembly (ESP32, RC522 RFID reader, IR optical sensor, and SG90 servo gate) costs under $25 total. The software has zero recurring licensing fees.'
    },
    {
      q: 'Can I use it on my phone?',
      a: 'Yes. The app is mobile-first with a fixed bottom navigation bar, large tap targets, and full touch support. You can pin it to your phone home screen just like a native app.'
    }
  ];

  function renderFaqAccordion() {
    if (!el.faqAccordionList) return;
    el.faqAccordionList.innerHTML = FAQS.map((faq, i) => `
      <div class="faq-item ${i === 0 ? 'open' : ''}" data-faq="${i}">
        <button type="button" class="faq-question-btn">
          <span>${helpers.escapeHtml(faq.q)}</span>
          <span class="faq-icon" aria-hidden="true">+</span>
        </button>
        <div class="faq-answer-collapse">
          <div class="faq-answer-inner">
            <p class="faq-answer-content">${helpers.escapeHtml(faq.a)}</p>
          </div>
        </div>
      </div>
    `).join('');

    el.faqAccordionList.querySelectorAll('.faq-question-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        el.faqAccordionList.querySelectorAll('.faq-item').forEach(it => it.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  // ── Supabase Client Initialization ─────────────────────────────
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
          params: { eventsPerSecond: 10 }
        }
      });
      return true;
    } catch (err) {
      setConnectionStatus('offline', 'INIT FAILED');
      console.error('[ERROR] Supabase client init error:', err);
      return false;
    }
  }

  // ── Realtime Subscriptions ─────────────────────────────────────
  function setupRealtime() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    setConnectionStatus('connecting', 'CONNECTING...');
    realtimeChannel = supabaseClient.channel('public:warehouse-ops');

    realtimeChannel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'arrival_events' },
      (payload) => handleIncomingArrivalEvent(payload.new)
    );

    realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'batches' },
      () => fetchBatchesAndEstimates()
    );

    realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sell_estimates' },
      () => fetchBatchesAndEstimates()
    );

    realtimeChannel.subscribe((status) => {
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
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      setupRealtime();
      fetchAllData();
    }, 5000);
  }

  // ── Data Fetching ──────────────────────────────────────────────
  async function fetchAllData() {
    if (!supabaseClient) return;

    try {
      await Promise.all([
        fetchProducts(),
        fetchForecasts(),
        fetchBatchesAndEstimates(),
        fetchArrivalEvents()
      ]);
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
    const todayStr = helpers.getTodayUtcIso();
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
        .select('batch_id, estimated_sell_date, expiry_risk, status, range_earliest_date, range_latest_date, computed_at')
    ]);

    if (batchesRes.error) throw batchesRes.error;
    if (estimatesRes.error) throw estimatesRes.error;

    state.batches = batchesRes.data || [];
    state.sellEstimates = new Map();
    for (const est of (estimatesRes.data || [])) {
      if (est.batch_id) {
        state.sellEstimates.set(est.batch_id, est);
      }
    }

    renderTodayScreen();
    renderParcelsScreen();
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

  // ── Incoming Realtime Scan Handling ────────────────────────────
  function handleIncomingArrivalEvent(newEvent) {
    if (!newEvent || state.arrivalEvents.some(e => e.id === newEvent.id)) return;

    state.arrivalEvents.unshift(newEvent);
    if (state.arrivalEvents.length > 50) state.arrivalEvents.pop();

    state.recentParcelId = newEvent.tag_uid;

    triggerBeltArrivalMotion(newEvent);

    const tagUid = newEvent.tag_uid || 'Unknown';
    if (newEvent.result === 'ok') {
      showToast(`Scan OK: Tag ${tagUid} confirmed parcel arrival.`);
      fetchBatchesAndEstimates();
    } else if (newEvent.result === 'unknown_tag') {
      showToast(`⚠️ Warning: Unknown RFID Tag ${tagUid} scanned.`);
    } else if (newEvent.result === 'duplicate') {
      showToast(`Duplicate: Tag ${tagUid} scan ignored during cooldown.`);
    }

    renderFeedScreen(newEvent.id);
  }

  function triggerBeltArrivalMotion(event) {
    if (!el.arrivalMotionEl || state.isIncomingMotion) return;
    state.isIncomingMotion = true;

    const prodMap = new Map(state.products.map(p => [p.id, p]));
    let lane = 'L';
    if (event.batch_id) {
      const b = state.batches.find(item => item.id === event.batch_id);
      if (b) {
        const prod = prodMap.get(b.product_id);
        lane = helpers.laneFor(prod?.weight_kg ?? 2.0);
      }
    }

    el.arrivalMotionEl.className = `arrival-motion arrival-motion--${lane}`;
    el.arrivalMotionEl.style.display = 'flex';

    setTimeout(() => {
      if (el.arrivalMotionEl) el.arrivalMotionEl.style.display = 'none';
      state.isIncomingMotion = false;
    }, 600);
  }

  // ── Render All ─────────────────────────────────────────────────
  function renderAll() {
    renderTodayScreen();
    renderParcelsScreen();
    renderForecastScreen();
    renderFeedScreen();
    renderProjectorScreen();
  }

  // ── Screen 1: Today ────────────────────────────────────────────
  function renderTodayScreen() {
    const todayStr = helpers.getTodayUtcIso();
    const prodMap = new Map(state.products.map(p => [p.id, p]));

    const todayBatches = state.batches.filter(b => b.arrived_at && b.arrived_at.startsWith(todayStr));
    const arrivedCount = todayBatches.length;

    let expectedCount = 0;
    for (const f of state.forecasts) {
      if (f.forecast_date === todayStr) {
        expectedCount += Math.round(Number(f.p50) || 0);
      }
    }
    if (expectedCount <= 0) expectedCount = 40;
    state.expectedToday = expectedCount;

    if (el.headlineCountArrived) el.headlineCountArrived.textContent = arrivedCount;
    if (el.headlineCountExpected) el.headlineCountExpected.textContent = expectedCount;
    if (el.headlineSubline) {
      const remaining = Math.max(expectedCount - arrivedCount, 0);
      el.headlineSubline.textContent = `${remaining} more parcel${remaining === 1 ? '' : 's'} expected today based on AI demand forecast.`;
    }

    // Update Landing page preview
    if (el.previewHeadlineNum) {
      el.previewHeadlineNum.textContent = `${arrivedCount} of ${expectedCount} parcels`;
    }
    if (el.quickCardTodaySub) {
      el.quickCardTodaySub.textContent = `${arrivedCount} arrived · ${Math.max(expectedCount - arrivedCount, 0)} expected`;
    }

    renderBeltTrack(todayBatches, expectedCount, prodMap);

    let leftCount = 0;
    let rightCount = 0;
    let riskCount = 0;
    const attentionList = [];

    for (const b of todayBatches) {
      const prod = prodMap.get(b.product_id);
      const lane = helpers.laneFor(prod?.weight_kg ?? 2.0);
      if (lane === 'L') leftCount++;
      else rightCount++;
    }

    for (const b of state.batches) {
      const est = state.sellEstimates.get(b.id);
      const prod = prodMap.get(b.product_id);
      if (helpers.isAtRisk(est, b)) {
        riskCount++;
        attentionList.push({ batch: b, product: prod, estimate: est });
      }
    }

    if (el.statLeftCount) el.statLeftCount.textContent = leftCount;
    if (el.statRightCount) el.statRightCount.textContent = rightCount;
    if (el.statRiskCount) el.statRiskCount.textContent = riskCount;
    if (el.previewStatLeft) el.previewStatLeft.textContent = leftCount;
    if (el.previewStatRight) el.previewStatRight.textContent = rightCount;
    if (el.previewStatRisk) el.previewStatRisk.textContent = riskCount;

    if (el.statRiskCard) {
      if (riskCount > 0) el.statRiskCard.classList.add('stat-card--shake');
      else el.statRiskCard.classList.remove('stat-card--shake');
    }

    renderAttentionCards(attentionList);
    renderTodayProductsGrid(todayBatches);
  }

  function renderBeltTrack(todayBatches, expectedCount, prodMap) {
    if (!el.beltRowContainer) return;

    const totalSlots = Math.max(expectedCount, todayBatches.length, 20);
    const blocksHtml = [];

    for (let i = 0; i < totalSlots; i++) {
      const b = todayBatches[i];
      let laneClass = '';
      let title = 'Still on its way';

      if (b) {
        const prod = prodMap.get(b.product_id);
        const lane = helpers.laneFor(prod?.weight_kg ?? 2.0);
        laneClass = `belt-block--${lane}`;
        title = `${prod?.name || 'Parcel'} (${lane === 'L' ? 'Went Left' : 'Went Right'})`;
      }

      const isPop = b && b.tag_uid === state.recentParcelId ? 'belt-block--pop' : '';
      blocksHtml.push(
        `<span class="belt-block ${laneClass} ${isPop}" title="${helpers.escapeHtml(title)}"></span>`
      );
    }

    el.beltRowContainer.innerHTML = blocksHtml.join('');
  }

  function renderAttentionCards(attentionList) {
    if (!el.attentionCardsContainer) return;

    if (attentionList.length === 0) {
      el.attentionCardsContainer.innerHTML =
        '<p class="attention-none">✓ Nothing at risk right now. All batches projected to sell before simulated expiry.</p>';
      return;
    }

    const cardsHtml = attentionList.map(({ batch, product, estimate }) => {
      const name = product ? product.name : 'Unknown Product';
      const expiry = batch.simulated_expiry_date || 'N/A';
      const sellDate = estimate?.estimated_sell_date || 'beyond horizon';

      return `
        <article class="attention-card">
          <p class="attention-product">${helpers.escapeHtml(name)} (Tag: ${helpers.escapeHtml(batch.tag_uid)})</p>
          <p class="attention-detail">
            Simulated expiry: <strong>${helpers.escapeHtml(expiry)}</strong> · Estimated sell date: <strong>${helpers.escapeHtml(sellDate)}</strong>
          </p>
          <p class="attention-action">⚠️ High Risk of Expiry — Sell or discount this batch first.</p>
        </article>
      `;
    }).join('');

    el.attentionCardsContainer.innerHTML = cardsHtml;
  }

  function renderTodayProductsGrid(todayBatches) {
    if (!el.todayProductsGrid) return;
    const todayStr = helpers.getTodayUtcIso();

    if (state.products.length === 0) {
      el.todayProductsGrid.innerHTML = '<div class="empty-state">No products found in catalog.</div>';
      return;
    }

    const arrivedMap = new Map();
    for (const b of todayBatches) {
      const cur = arrivedMap.get(b.product_id) || { units: 0, batches: 0 };
      cur.units += (b.quantity || 0);
      cur.batches += 1;
      arrivedMap.set(b.product_id, cur);
    }

    const cardsHtml = state.products.map(prod => {
      const arr = arrivedMap.get(prod.id) || { units: 0, batches: 0 };
      const prodForecasts = state.forecasts.filter(f => f.product_id === prod.id);
      const todayForecast = prodForecasts.find(f => f.forecast_date === todayStr);

      const p50Val = todayForecast ? Number(todayForecast.p50).toFixed(1) : 'N/A';
      const p10Val = todayForecast ? Number(todayForecast.p10).toFixed(1) : '—';
      const p90Val = todayForecast ? Number(todayForecast.p90).toFixed(1) : '—';

      const nextDays = prodForecasts.slice(0, 4);
      let timelineHtml = '';
      if (nextDays.length > 0) {
        timelineHtml = `
          <div class="timeline-horizon">
            <div class="timeline-header">
              <span>Next 4 Days</span>
              <span class="sim-pill">SIMULATED DEMAND</span>
            </div>
            <div class="timeline-days">
              ${nextDays.map(d => `
                <div class="timeline-col">
                  <div class="timeline-day">${helpers.formatShortDate(d.forecast_date)}</div>
                  <div class="timeline-p50">${Number(d.p50).toFixed(0)}</div>
                  <div class="timeline-range">${Number(d.p10).toFixed(0)}–${Number(d.p90).toFixed(0)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      return `
        <article class="prod-card">
          <div class="prod-card-top">
            <div>
              <h3 class="prod-name">${helpers.escapeHtml(prod.name)}</h3>
              <span class="sim-pill">${prod.weight_kg} kg (SIMULATED)</span>
            </div>
            <span class="chip" style="padding: 2px 8px; font-size: 11px;">${helpers.escapeHtml(prod.category)}</span>
          </div>

          <div class="comparison-box">
            <div class="comparison-metric">
              <span class="metric-title">Arrived Today</span>
              <span class="metric-val num-ok">${arr.units}</span>
              <span class="metric-sub">${arr.batches} batch(es)</span>
            </div>
            <div class="comparison-metric">
              <span class="metric-title">Demand (p50)</span>
              <span class="metric-val num-blue">${p50Val}</span>
              <span class="band-strip">p10–p90: ${p10Val}–${p90Val}</span>
            </div>
          </div>

          ${timelineHtml}
        </article>
      `;
    }).join('');

    el.todayProductsGrid.innerHTML = cardsHtml;
  }

  // ── Screen 2: Parcels / Stock ──────────────────────────────────
  function renderParcelsScreen() {
    const prodMap = new Map(state.products.map(p => [p.id, p]));
    const filtered = helpers.filterBatches(
      state.batches,
      prodMap,
      state.parcelSearch,
      state.parcelFilter,
      state.sellEstimates
    );

    if (el.countFilterAll) el.countFilterAll.textContent = state.batches.length;

    renderParcelsCards(filtered, prodMap);
    renderParcelsTable(filtered, prodMap);
  }

  function renderParcelsCards(filtered, prodMap) {
    if (!el.parcelsCardsContainer) return;

    if (filtered.length === 0) {
      el.parcelsCardsContainer.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">📦</span>
          <h3>No Parcels Match</h3>
          <p>Clear the search query or select another filter chip.</p>
        </div>
      `;
      return;
    }

    const cardsHtml = filtered.map(b => {
      const prod = prodMap.get(b.product_id);
      const prodName = prod ? prod.name : 'Unknown Product';
      const weight = prod?.weight_kg ?? 2.0;
      const lane = helpers.laneFor(weight);
      const est = state.sellEstimates.get(b.id);
      const atRisk = helpers.isAtRisk(est, b);

      let estSellStr = 'Pending calculation';
      if (est) {
        if (est.estimated_sell_date) {
          const range = (est.range_earliest_date && est.range_latest_date && est.range_earliest_date !== est.range_latest_date)
            ? ` (${est.range_earliest_date} .. ${est.range_latest_date})`
            : '';
          estSellStr = `${est.estimated_sell_date}${range}`;
        } else if (est.status === 'beyond_horizon') {
          estSellStr = 'Beyond horizon';
        } else if (est.status === 'unknown') {
          estSellStr = 'Unknown (no forecast)';
        }
      }

      const isNew = b.tag_uid === state.recentParcelId ? 'parcel-row--new' : '';

      return `
        <article class="parcel-row ${isNew}" data-tag="${helpers.escapeHtml(b.tag_uid)}">
          <div class="parcel-topline">
            <h3 class="parcel-product">${helpers.escapeHtml(prodName)}</h3>
            <div class="parcel-tags">
              <span class="lane-tag lane-tag--${lane}">${lane === 'L' ? 'Left lane' : 'Right lane'}</span>
              ${atRisk ? '<span class="risk-tag">May expire first</span>' : ''}
            </div>
          </div>
          <p class="parcel-meta">
            ${weight} kg (SIMULATED) · Tag <strong style="font-family: var(--font-mono);">${helpers.escapeHtml(b.tag_uid)}</strong> · Qty: ${b.quantity} units · Arrived: ${helpers.formatDateTime(b.arrived_at)}
          </p>
          <p class="parcel-meta">
            Simulated Expiry: <strong>${helpers.escapeHtml(b.simulated_expiry_date || 'N/A')}</strong> · Est. Sell Date: <strong>${helpers.escapeHtml(estSellStr)}</strong>
            <span class="sim-pill" style="margin-left: 6px;">SIMULATED</span>
          </p>
        </article>
      `;
    }).join('');

    el.parcelsCardsContainer.innerHTML = cardsHtml;
  }

  function renderParcelsTable(filtered, prodMap) {
    if (!el.stockTableBody) return;

    if (filtered.length === 0) {
      el.stockTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No matching stock batches found.</td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered.map(b => {
      const prod = prodMap.get(b.product_id);
      const prodName = prod ? prod.name : 'Unknown Product';
      const weight = prod?.weight_kg ?? 2.0;
      const lane = helpers.laneFor(weight);
      const est = state.sellEstimates.get(b.id);
      const atRisk = helpers.isAtRisk(est, b);

      let riskBadge = '<span class="badge-risk risk-pending">⚪ Pending Calc</span>';
      if (est) {
        if (atRisk) {
          riskBadge = '<span class="badge-risk risk-high">⚠️ HIGH RISK</span>';
        } else if (est.expiry_risk === false) {
          riskBadge = '<span class="badge-risk risk-low">✓ On Track</span>';
        }
      }

      let estSellStr = '<span style="color: var(--muted); font-size:12px;">Pending calculation</span>';
      if (est) {
        if (est.estimated_sell_date) {
          const rangeInfo = (est.range_earliest_date && est.range_latest_date && est.range_earliest_date !== est.range_latest_date)
            ? `<div style="font-size:11px; color:var(--muted);">(range: ${helpers.escapeHtml(est.range_earliest_date)} .. ${helpers.escapeHtml(est.range_latest_date)})</div>`
            : '';
          estSellStr = `<span style="font-weight:600;">${helpers.escapeHtml(est.estimated_sell_date)}</span>${rangeInfo}`;
        } else if (est.status === 'beyond_horizon') {
          estSellStr = '<span class="badge-risk risk-pending">Beyond horizon</span>';
        } else if (est.status === 'unknown') {
          estSellStr = '<span style="color: var(--muted); font-size:12px;">Unknown (no forecast)</span>';
        }
      }

      return `
        <tr>
          <td>
            <strong>${helpers.escapeHtml(prodName)}</strong>
            <div style="font-size: 11px; color: var(--muted);">${weight} kg (SIMULATED)</div>
          </td>
          <td class="col-tag">${helpers.escapeHtml(b.tag_uid)}</td>
          <td class="col-qty">${b.quantity} units</td>
          <td><span class="lane-tag lane-tag--${lane}">${lane === 'L' ? 'Left' : 'Right'}</span></td>
          <td style="font-size: 12.5px;">${helpers.formatDateTime(b.arrived_at)}</td>
          <td>
            <div style="font-family: var(--font-mono); font-weight:700;">${helpers.escapeHtml(b.simulated_expiry_date || 'N/A')}</div>
            <span class="sim-pill">SIMULATED EXPIRY</span>
          </td>
          <td style="font-family: var(--font-mono);">${estSellStr}</td>
          <td>${riskBadge}</td>
        </tr>
      `;
    }).join('');

    el.stockTableBody.innerHTML = rowsHtml;
  }

  // ── Screen 3: Forecast Bar Chart ───────────────────────────────
  function renderForecastScreen() {
    if (!el.forecastBarChart) return;

    const dailyTotalsMap = new Map();
    for (const f of state.forecasts) {
      const cur = dailyTotalsMap.get(f.forecast_date) || 0;
      dailyTotalsMap.set(f.forecast_date, cur + (Number(f.p50) || 0));
    }

    const sortedDates = Array.from(dailyTotalsMap.keys()).sort();
    const forecastDays = [];

    if (sortedDates.length >= 7) {
      for (let i = 0; i < 7; i++) {
        const dStr = sortedDates[i];
        forecastDays.push({
          day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : helpers.formatShortDate(dStr),
          count: Math.round(dailyTotalsMap.get(dStr))
        });
      }
    } else {
      const sampleFallback = [45, 38, 41, 36, 45, 52, 39];
      for (let i = 0; i < 7; i++) {
        if (i < sortedDates.length) {
          const dStr = sortedDates[i];
          forecastDays.push({
            day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : helpers.formatShortDate(dStr),
            count: Math.round(dailyTotalsMap.get(dStr))
          });
        } else {
          const d = new Date();
          d.setDate(d.getDate() + i);
          forecastDays.push({
            day: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(d),
            count: sampleFallback[i] || 40,
            isSample: true
          });
        }
      }
    }

    const busiest = Math.max(...forecastDays.map(d => d.count), 1);
    const tomorrow = forecastDays[1]?.count || 0;

    if (el.forecastTomorrowCount) {
      el.forecastTomorrowCount.textContent = tomorrow;
    }

    const points = forecastDays.map((d, index) => {
      const x = 50 + (index * 600) / Math.max(forecastDays.length - 1, 1);
      const y = 90 - (d.count / busiest) * 70;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const barsHtml = forecastDays.map((d, index) => {
      const isToday = index === 0;
      const isBusiest = d.count === busiest;
      const barClass = isToday ? 'bar-fill--today' : (isBusiest ? 'bar-fill--busiest' : '');
      const heightPct = Math.max((d.count / busiest) * 100, 8);

      return `
        <div class="bar-col" tabindex="0">
          <span class="bar-num">${d.count}</span>
          <span class="bar-tooltip">about ${d.count} parcels ${d.isSample ? '(SAMPLE DATA)' : ''}</span>
          <span
            class="bar-fill ${barClass}"
            style="--bar-height: ${heightPct}%; height: ${heightPct}%;"
            aria-label="${d.day}: about ${d.count} parcels"
          ></span>
          <span class="bar-day">${d.day}</span>
        </div>
      `;
    }).join('');

    const svgLine = `
      <svg class="forecast-line" viewBox="0 0 700 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="${points}"></path>
      </svg>
    `;

    el.forecastBarChart.innerHTML = barsHtml + svgLine;
  }

  // ── Screen 4: Live Feed ────────────────────────────────────────
  function renderFeedScreen(newestEventId) {
    if (!el.liveFeedContainer) return;

    let okCount = 0;
    let unkCount = 0;
    let dupCount = 0;

    for (const ev of state.arrivalEvents) {
      if (ev.result === 'ok') okCount++;
      else if (ev.result === 'unknown_tag') unkCount++;
      else if (ev.result === 'duplicate') dupCount++;
    }

    if (el.countFeedAll) el.countFeedAll.textContent = state.arrivalEvents.length;
    if (el.countFeedOk) el.countFeedOk.textContent = okCount;
    if (el.countFeedUnknown) el.countFeedUnknown.textContent = unkCount;
    if (el.countFeedDuplicate) el.countFeedDuplicate.textContent = dupCount;

    const filtered = state.arrivalEvents.filter(ev => {
      if (state.feedFilter === 'all') return true;
      return ev.result === state.feedFilter;
    });

    if (filtered.length === 0) {
      el.liveFeedContainer.innerHTML = `
        <div class="card empty-state">
          <span class="empty-icon">📡</span>
          <h3>No Events in Filter '${state.feedFilter.toUpperCase()}'</h3>
          <p>Scan a tag at the ESP32 station to view live events.</p>
        </div>
      `;
      return;
    }

    const itemsHtml = filtered.map(ev => {
      const isNew = ev.id === newestEventId ? 'new-arrival' : '';
      let badgeLabel = 'OK / ARRIVED';
      if (ev.result === 'unknown_tag') badgeLabel = 'UNKNOWN TAG';
      else if (ev.result === 'duplicate') badgeLabel = 'DUPLICATE (COOLDOWN)';

      return `
        <article class="feed-item result-${ev.result || 'ok'} ${isNew}">
          <div>
            <span class="feed-badge">${badgeLabel}</span>
            <div class="feed-info">
              Tag: <span style="font-family: var(--font-mono);">${helpers.escapeHtml(ev.tag_uid)}</span>
              <span style="font-size: 12px; color: var(--muted); margin-left: 8px;">Device: ${helpers.escapeHtml(ev.device_id || 'ESP32')} ${ev.batch_id ? '• Batch Created' : ''}</span>
            </div>
          </div>
          <div class="feed-time">
            <div>${helpers.formatDateTime(ev.created_at)}</div>
            <div style="font-size: 11px; color: var(--muted);">${helpers.timeAgo(ev.created_at)}</div>
          </div>
        </article>
      `;
    }).join('');

    el.liveFeedContainer.innerHTML = itemsHtml;
  }

  // ── Screen 5: Projector Presentation Mode ──────────────────────
  function renderProjectorScreen() {
    if (!el.projectorTodayContainer || !el.projectorFeedContainer) return;
    el.projectorTodayContainer.innerHTML = el.todayProductsGrid ? el.todayProductsGrid.innerHTML : '';
    el.projectorFeedContainer.innerHTML = el.liveFeedContainer ? el.liveFeedContainer.innerHTML : '';
  }

  // ── Navigation & Tab Switcher ──────────────────────────────────
  const TAB_ORDER = ['home', 'today', 'parcels', 'forecast', 'feed', 'projector'];

  function switchTab(targetTab, options = {}) {
    if (!TAB_ORDER.includes(targetTab)) return;
    state.activeTab = targetTab;

    // Set data-active-tab attribute for instant CSS-driven navbar switching
    document.body.setAttribute('data-active-tab', targetTab);

    const isHome = targetTab === 'home';

    // Home page shows ONLY the landing navbar; entering dashboard shows the dashboard navbar
    if (el.siteHeader) {
      el.siteHeader.style.display = isHome ? 'none' : 'block';
    }
    if (el.mobileNav) {
      el.mobileNav.style.display = isHome ? 'none' : '';
    }

    const tabIndex = TAB_ORDER.indexOf(targetTab);
    const pillTranslate = `translateX(${tabIndex * 100}%)`;

    if (el.desktopNavPill) el.desktopNavPill.style.transform = pillTranslate;
    if (el.mobileNavPill) el.mobileNavPill.style.transform = pillTranslate;

    el.navTabs.forEach(tabBtn => {
      if (tabBtn.dataset.tab === targetTab) {
        tabBtn.setAttribute('aria-current', 'page');
      } else {
        tabBtn.removeAttribute('aria-current');
      }
    });

    el.tabPanels.forEach(panel => {
      if (panel.id === `panel-${targetTab}`) {
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    });

    if (options.filter && targetTab === 'parcels') {
      state.parcelFilter = options.filter;
      el.parcelChips.forEach(c => {
        if (c.dataset.filter === options.filter) c.classList.add('active');
        else c.classList.remove('active');
      });
      renderParcelsScreen();
    }

    if (targetTab === 'projector') {
      renderProjectorScreen();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Local Simulation (Demo Only) ──────────────────────────────
  const SAMPLE_PRODUCTS = [
    { name: 'Chips', weight_kg: 2.0 },
    { name: 'Green Tea', weight_kg: 0.5 },
    { name: 'Pasta', weight_kg: 1.0 },
    { name: 'Coffee', weight_kg: 0.8 },
    { name: 'Flour Sack', weight_kg: 20.0 },
    { name: 'Sugar Sack', weight_kg: 25.0 }
  ];

  function simulateLocalParcel() {
    const randomProduct = SAMPLE_PRODUCTS[Math.floor(Math.random() * SAMPLE_PRODUCTS.length)];
    const mockUid = 'SIM-' + Math.floor(1000 + Math.random() * 9000);
    const lane = helpers.laneFor(randomProduct.weight_kg);

    state.recentParcelId = mockUid;

    if (el.arrivalMotionEl) {
      el.arrivalMotionEl.className = `arrival-motion arrival-motion--${lane}`;
      el.arrivalMotionEl.style.display = 'flex';
      setTimeout(() => {
        if (el.arrivalMotionEl) el.arrivalMotionEl.style.display = 'none';
      }, 600);
    }

    showToast(`[SAMPLE DATA] ${randomProduct.name}, ${randomProduct.weight_kg} kg, went ${lane === 'L' ? 'left' : 'right'}.`);

    const currentArrived = parseInt(el.headlineCountArrived.textContent, 10) || 0;
    el.headlineCountArrived.textContent = currentArrived + 1;
  }

  // ── Settings Modal ─────────────────────────────────────────────
  function openSettingsModal() {
    const config = resolveConfig();
    if (el.cfgSupabaseUrl) el.cfgSupabaseUrl.value = config.supabaseUrl;
    if (el.cfgAnonKey) el.cfgAnonKey.value = config.supabaseAnonKey;
    if (el.settingsModal) el.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    if (el.settingsModal) el.settingsModal.classList.add('hidden');
  }

  function saveSettingsModal() {
    const url = (el.cfgSupabaseUrl?.value || '').trim().replace(/\/$/, '');
    const key = (el.cfgAnonKey?.value || '').trim();

    if (!url || !key) {
      alert('Please enter both Supabase Project URL and Public Anon Key.');
      return;
    }

    localStorage.setItem('sw_supabase_url', url);
    localStorage.setItem('sw_supabase_anon_key', key);
    closeSettingsModal();

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

  // ── Event Handlers Setup ───────────────────────────────────────
  function setupEvents() {
    // Navigation Tabs
    el.navTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    if (el.brandLogo) {
      el.brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('home');
      });
    }

    if (el.btnHeaderGoHome) {
      el.btnHeaderGoHome.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('home');
      });
    }

    // Landing Page Action Buttons
    if (el.landingLogoHome) {
      el.landingLogoHome.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (el.btnLandingNavDashboard) {
      el.btnLandingNavDashboard.addEventListener('click', () => switchTab('today'));
    }
    if (el.btnLandingOpenDashboard) {
      el.btnLandingOpenDashboard.addEventListener('click', () => switchTab('today'));
    }
    if (el.btnDrawerOpenDashboard) {
      el.btnDrawerOpenDashboard.addEventListener('click', () => {
        if (el.mobileDrawer) el.mobileDrawer.style.display = 'none';
        switchTab('today');
      });
    }
    if (el.btnHeroOpenDashboard) {
      el.btnHeroOpenDashboard.addEventListener('click', () => switchTab('today'));
    }
    if (el.btnPreviewOpenLive) {
      el.btnPreviewOpenLive.addEventListener('click', () => switchTab('today'));
    }
    if (el.btnFooterOpenDashboard) {
      el.btnFooterOpenDashboard.addEventListener('click', () => switchTab('today'));
    }

    // Quick cards
    if (el.quickCardToday) {
      el.quickCardToday.addEventListener('click', () => switchTab('today'));
    }
    if (el.quickCardRisk) {
      el.quickCardRisk.addEventListener('click', () => switchTab('parcels', { filter: 'risk' }));
    }
    if (el.quickCardForecast) {
      el.quickCardForecast.addEventListener('click', () => switchTab('forecast'));
    }

    // Footer links
    if (el.footerLinkToday) {
      el.footerLinkToday.addEventListener('click', () => switchTab('today'));
    }
    if (el.footerLinkParcels) {
      el.footerLinkParcels.addEventListener('click', () => switchTab('parcels'));
    }
    if (el.footerLinkForecast) {
      el.footerLinkForecast.addEventListener('click', () => switchTab('forecast'));
    }

    // MiniBelt Canvas Drop
    if (el.btnDropCanvasBox) {
      el.btnDropCanvasBox.addEventListener('click', () => {
        if (spawnCanvasBoxFn) spawnCanvasBoxFn(20);
      });
    }
    if (el.miniBeltCanvasWrap) {
      el.miniBeltCanvasWrap.addEventListener('click', () => {
        if (spawnCanvasBoxFn) spawnCanvasBoxFn(20);
      });
    }

    // Audience Tabs
    el.whoTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.whoTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.audience = btn.dataset.audience;
        renderAudienceCards(state.audience);
      });
    });

    // Mobile Hamburger
    if (el.btnMobileHamburger) {
      el.btnMobileHamburger.addEventListener('click', () => {
        if (!el.mobileDrawer) return;
        const isOpen = el.mobileDrawer.style.display === 'flex';
        el.mobileDrawer.style.display = isOpen ? 'none' : 'flex';
        el.btnMobileHamburger.textContent = isOpen ? '☰' : '✕';
      });
    }

    // Sticky Landing Nav Scroll Listener
    window.addEventListener('scroll', () => {
      if (!el.landingNavWrap) return;
      if (window.scrollY > 30) {
        el.landingNavWrap.classList.add('scrolled');
      } else {
        el.landingNavWrap.classList.remove('scrolled');
      }
    }, { passive: true });

    // Refresh & Settings & Theme
    if (el.btnRefresh) el.btnRefresh.addEventListener('click', () => fetchAllData());
    if (el.btnSettings) el.btnSettings.addEventListener('click', openSettingsModal);
    if (el.btnThemeToggle) el.btnThemeToggle.addEventListener('click', toggleTheme);

    // Modal
    if (el.btnCloseSettings) el.btnCloseSettings.addEventListener('click', closeSettingsModal);
    if (el.btnSaveConfig) el.btnSaveConfig.addEventListener('click', saveSettingsModal);
    if (el.btnResetConfig) el.btnResetConfig.addEventListener('click', resetSettingsModal);

    // Parcels View Switcher (Cards vs Table)
    if (el.btnViewCards) {
      el.btnViewCards.addEventListener('click', () => {
        state.parcelView = 'cards';
        el.btnViewCards.classList.add('active');
        if (el.btnViewTable) el.btnViewTable.classList.remove('active');
        if (el.parcelsCardsContainer) el.parcelsCardsContainer.style.display = 'flex';
        if (el.parcelsTableContainer) el.parcelsTableContainer.style.display = 'none';
      });
    }

    if (el.btnViewTable) {
      el.btnViewTable.addEventListener('click', () => {
        state.parcelView = 'table';
        el.btnViewTable.classList.add('active');
        if (el.btnViewCards) el.btnViewCards.classList.remove('active');
        if (el.parcelsCardsContainer) el.parcelsCardsContainer.style.display = 'none';
        if (el.parcelsTableContainer) el.parcelsTableContainer.style.display = 'block';
      });
    }

    // Parcels Search & Filter
    if (el.parcelSearchInput) {
      el.parcelSearchInput.addEventListener('input', (e) => {
        state.parcelSearch = e.target.value;
        if (el.btnSearchClear) {
          el.btnSearchClear.style.display = state.parcelSearch ? 'grid' : 'none';
        }
        renderParcelsScreen();
      });
    }

    if (el.btnSearchClear) {
      el.btnSearchClear.addEventListener('click', () => {
        state.parcelSearch = '';
        if (el.parcelSearchInput) el.parcelSearchInput.value = '';
        el.btnSearchClear.style.display = 'none';
        renderParcelsScreen();
      });
    }

    el.parcelChips.forEach(chip => {
      chip.addEventListener('click', () => {
        el.parcelChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.parcelFilter = chip.dataset.filter;
        renderParcelsScreen();
      });
    });

    // Feed Filter Chips
    el.feedChips.forEach(chip => {
      chip.addEventListener('click', () => {
        el.feedChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.feedFilter = chip.dataset.feedFilter;
        renderFeedScreen();
      });
    });

    // Local Simulate Parcel button
    if (el.btnSimulateParcel) {
      el.btnSimulateParcel.addEventListener('click', simulateLocalParcel);
    }
  }

  // ── Start Application ──────────────────────────────────────────
  function start() {
    initElements();
    initTheme();
    renderAudienceCards('shops');
    renderFaqAccordion();
    initLandingTypewriter();
    initMiniBeltCanvas();
    setupEvents();

    // Initialize tab: landing page on home by default, or target dashboard tab if hash is set
    const initialHash = (window.location.hash || '').replace(/^#/, '');
    if (TAB_ORDER.includes(initialHash)) {
      switchTab(initialHash);
    } else {
      switchTab('home');
    }

    window.addEventListener('hashchange', () => {
      const h = (window.location.hash || '').replace(/^#/, '');
      if (TAB_ORDER.includes(h)) {
        switchTab(h);
      }
    });

    const ok = initSupabase();
    if (ok) {
      setupRealtime();
      fetchAllData();

      const config = resolveConfig();
      pollIntervalId = setInterval(() => {
        fetchAllData();
      }, config.pollIntervalMs);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
