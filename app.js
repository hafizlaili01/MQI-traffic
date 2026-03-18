/* ============================================
   MIMOS QUANTUM INTELLIGENCE — Dashboard Logic
   MapLibre GL JS + Deck.gl + Overpass + OSM
   Free / No API key required
   ============================================ */

'use strict';

// ===== CAMERA STATE =====
const cameraState = {
  cameras: [],          // LIVE cameras with confirmed imageUrl only
  osmNodes: [],         // OSM surveillance map pins (no image)
  myNodes: [],          // Malaysia highway camera positions (no image)
  filtered: [],         // after filter applied
  activeFilter: 'all',
  refreshTimer: null,
  openCamera: null,     // currently viewed camera
  modalRefreshTimer: null
};

// ===== STATE =====
const state = {
  map: null,
  deckOverlay: null,
  center: { lat: 3.1390, lng: 101.6869 },
  zoom: 13,
  tilt: 45,
  heading: 0,
  layers: {
    traffic: true,
    incidents: true,
    roads: true,
    buildings: true,
    poi: false,
    heatmap: false,
    cameras: true
  },
  extrusion: 50,
  opacity: 0.8,
  currentArea: 'Kuala Lumpur, Malaysia',
  osmData: { roads: [], buildings: [], pois: [] },
  tomtomData: { segments: [] },
  incidents: [],
  mapStyle: 'satellite',
  refreshTimer: null,
  refreshInterval: 60,
  lastUpdated: null,
  animFrame: null
};

// ===== FREE MAP TILE STYLES =====
const MAP_STYLES_URL = {
  satellite: 'https://demotiles.maplibre.org/satellite-tiles/tiles.json',  // fallback
  dark:     {
    version: 8,
    name: 'Dark',
    sources: {
      'osm-dark': {
        type: 'raster',
        tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; Stadia Maps, OpenMapTiles, OpenStreetMap'
      }
    },
    layers: [{ id: 'osm-dark-layer', type: 'raster', source: 'osm-dark' }]
  },
  roadmap: {
    version: 8,
    name: 'Roadmap',
    sources: {
      'osm': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
  },
  terrain: {
    version: 8,
    name: 'Terrain',
    sources: {
      'terrain': {
        type: 'raster',
        tiles: ['https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; Stadia Maps, Stamen Design, OpenStreetMap'
      }
    },
    layers: [{ id: 'terrain-layer', type: 'raster', source: 'terrain' }]
  }
};

// Default dark style
const DEFAULT_STYLE = {
  version: 8,
  name: 'MIMOSDark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; CARTO, OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0d0e10' }
    },
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      paint: { 'raster-opacity': 1 }
    }
  ]
};

const SATELLITE_STYLE = {
  version: 8,
  name: 'Satellite',
  sources: {
    'esri-sat': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    }
  },
  layers: [
    {
      id: 'esri-sat-layer',
      type: 'raster',
      source: 'esri-sat'
    }
  ]
};

// ===== INIT =====
function init() {
  lucide.createIcons();
  setupTheme();
  setupSidebar();
  setupPanelTabs();
  setupSliders();
  setupSearch();
  setupPresetChips();
  setupLayerToggles();
  setupMapStyleChips();
  setupRefreshControls();
  setupCameraControls();
  setupCameraModal();
  setupAIPlanner();
  setupMobileUI();
  initMap();
  setupMapControls();
}

// ===== THEME =====
function setupTheme() {
  const btn = document.getElementById('themeToggle');
  const inner = document.getElementById('themeToggleInner');
  const html = document.documentElement;
  // Start in dark (Night) mode
  let dark = html.getAttribute('data-theme') !== 'light';
  html.setAttribute('data-theme', dark ? 'dark' : 'light');

  // Sun SVG (shown in Night mode — click to switch to Day)
  const sunSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  // Moon SVG (shown in Day mode — click to switch to Night)
  const moonSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function updateToggle() {
    // When dark (Night): show sun icon + label "Day" (switching to day)
    // When light (Day): show moon icon + label "Night" (switching to night)
    if (dark) {
      inner.innerHTML = sunSVG + '<span class="theme-label">Day</span>';
      btn.setAttribute('title', 'Switch to Day Mode');
    } else {
      inner.innerHTML = moonSVG + '<span class="theme-label">Night</span>';
      btn.setAttribute('title', 'Switch to Night Mode');
    }
  }

  updateToggle();

  btn.addEventListener('click', () => {
    dark = !dark;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateToggle();
    // Rebuild deck layers so building colors adapt to current theme
    refreshDeckLayers();
  });
}

// ===== SIDEBAR =====
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const openBtn = document.getElementById('sidebarOpenBtn');

  toggleBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      // On mobile, hamburger controls sidebar — sidebar toggle inside is hidden via CSS
      closeMobileSidebar && closeMobileSidebar();
      return;
    }
    sidebar.classList.add('collapsed');
    openBtn.style.display = 'flex';
  });
  openBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) return;
    sidebar.classList.remove('collapsed');
    openBtn.style.display = 'none';
  });
}

// ===== PANEL TABS =====
function setupPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  const panes = document.querySelectorAll('.tab-pane');
  const panel = document.getElementById('osintPanel');
  const collapseBtn = document.getElementById('panelCollapse');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`[data-pane="${tab.dataset.tab}"]`)?.classList.add('active');
      if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
      // On mobile: if sheet is peeked, open to half on tab click
      if (window.innerWidth <= 768) {
        if (typeof sheetStateIdx !== 'undefined' && sheetStateIdx === 0) {
          sheetStateIdx = 1;
          applySheetState(panel, sheetStateIdx);
        }
      }
    });
  });
  collapseBtn.addEventListener('click', () => panel.classList.toggle('collapsed'));
}

// ===== SLIDERS =====
function setupSliders() {
  document.getElementById('tiltSlider').addEventListener('input', e => {
    state.tilt = +e.target.value;
    document.getElementById('tiltVal').textContent = state.tilt + '°';
    if (state.map) state.map.setPitch(state.tilt);
  });
  document.getElementById('extrusionSlider').addEventListener('input', e => {
    state.extrusion = +e.target.value;
    document.getElementById('extrusionVal').textContent = state.extrusion + 'x';
    refreshDeckLayers();
  });
  document.getElementById('opacitySlider').addEventListener('input', e => {
    state.opacity = +e.target.value / 100;
    document.getElementById('opacityVal').textContent = Math.round(state.opacity * 100) + '%';
    refreshDeckLayers();
  });
}

// ===== LAYER TOGGLES =====
function setupLayerToggles() {
  const map = { layerTraffic: 'traffic', layerIncidents: 'incidents', layerRoads: 'roads', layerBuildings: 'buildings', layerPOI: 'poi', layerHeatmap: 'heatmap', layerCameras: 'cameras' };
  Object.entries(map).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => {
      state.layers[key] = e.target.checked;
      refreshDeckLayers();
    });
  });
}

// ===== MAP STYLE =====
function setupMapStyleChips() {
  document.querySelectorAll('.style-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyMapStyle(chip.dataset.mapid);
    });
  });
}

function applyMapStyle(styleName) {
  state.mapStyle = styleName;
  if (!state.map) return;
  const styleMap = {
    satellite: SATELLITE_STYLE,
    dark: MAP_STYLES_URL.dark,
    roadmap: MAP_STYLES_URL.roadmap,
    terrain: MAP_STYLES_URL.terrain
  };

  // Remove existing deck overlay before style change
  // (interleaved:true overlays are tied to the GL context of the style)
  if (state.deckOverlay) {
    try { state.map.removeControl(state.deckOverlay); } catch(e) {}
    state.deckOverlay = null;
  }

  state.map.setStyle(styleMap[styleName] || DEFAULT_STYLE);

  // Re-attach deck overlay after style reloads
  state.map.once('styledata', () => {
    refreshDeckLayers();
  });
}

// ===== SEARCH =====
function setupSearch() {
  const input = document.getElementById('areaSearch');
  const btn = document.getElementById('searchBtn');
  const suggestions = document.getElementById('searchSuggestions');
  let debounce;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { suggestions.style.display = 'none'; return; }
    debounce = setTimeout(() => geocodeSearch(q, suggestions), 400);
  });

  btn.addEventListener('click', () => { const q = input.value.trim(); if (q) performSearch(q); });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const q = input.value.trim(); if (q) performSearch(q); suggestions.style.display = 'none'; }
  });

  document.addEventListener('click', e => {
    if (!suggestions.contains(e.target) && e.target !== input) suggestions.style.display = 'none';
  });
}

async function geocodeSearch(query, suggestions) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) { suggestions.style.display = 'none'; return; }

    suggestions.innerHTML = data.map(r => `
      <div class="suggestion-item" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${r.display_name.substring(0, 65)}${r.display_name.length > 65 ? '…' : ''}
      </div>`).join('');

    suggestions.style.display = 'block';
    suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('areaSearch').value = item.dataset.name.split(',')[0];
        suggestions.style.display = 'none';
        flyTo(parseFloat(item.dataset.lat), parseFloat(item.dataset.lng), item.dataset.name.split(',').slice(0, 2).join(','));
      });
    });
  } catch(e) { console.error('Geocode error:', e); }
}

async function performSearch(query) {
  document.getElementById('searchSuggestions').style.display = 'none';
  const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) { flyTo(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]), query); return; }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data.length) flyTo(parseFloat(data[0].lat), parseFloat(data[0].lon), query);
  } catch(e) { console.error('Search error:', e); }
}

// ===== PRESET CHIPS =====
function setupPresetChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      flyTo(parseFloat(chip.dataset.lat), parseFloat(chip.dataset.lng), chip.dataset.place);
    });
  });
  document.querySelector('.chip[data-place="Kuala Lumpur, Malaysia"]')?.classList.add('active');
}

// ===== REFRESH =====
function setupRefreshControls() {
  document.getElementById('refreshInterval').addEventListener('change', e => {
    state.refreshInterval = +e.target.value;
    clearInterval(state.refreshTimer);
    if (state.refreshInterval > 0) state.refreshTimer = setInterval(() => loadAllData(), state.refreshInterval * 1000);
  });
  document.getElementById('manualRefresh').addEventListener('click', function() {
    this.classList.add('spinning');
    loadAllData().then(() => setTimeout(() => this.classList.remove('spinning'), 800));
  });
}

// ===== MAP INIT =====
function initMap() {
  state.map = new maplibregl.Map({
    container: 'map',
    style: DEFAULT_STYLE,
    center: [state.center.lng, state.center.lat],
    zoom: state.zoom,
    pitch: state.tilt,
    bearing: 0,
    antialias: true
  });

  state.map.on('load', () => {
    // Start auto refresh timer
    state.refreshTimer = setInterval(() => loadAllData(), 60000);
    loadAllData();
    // Load camera data after main data
    setTimeout(() => loadCameraData(), 1500);
  });

  state.map.on('move', () => {
    const c = state.map.getCenter();
    state.center = { lat: c.lat, lng: c.lng };
  });
}

// ===== FLY TO =====
function flyTo(lat, lng, name) {
  state.center = { lat, lng };
  state.currentArea = name;

  document.getElementById('currentArea').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--accent)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    ${name.length > 40 ? name.substring(0, 40) + '…' : name}
  `;

  if (state.map) {
    state.map.flyTo({ center: [lng, lat], zoom: 14, pitch: state.tilt, speed: 1.4 });
  }

  loadAllData();
}

// ===== LOAD ALL DATA =====
async function loadAllData() {
  showLoading(true, 'Fetching QI data…');

  try {
    updateKPIs({ congestion: '…', incidents: '…', roads: '…', speed: '…' });

    setLoadingDetail('OpenStreetMap Overpass API');
    await loadOSMData();

    setLoadingDetail('Traffic Flow Intelligence');
    await loadTrafficData();

    setLoadingDetail('Incident Intelligence');
    generateIncidents();

    setLoadingDetail('Rendering 3D layers');
    refreshDeckLayers();

    updateAnalytics();
    updateRoadPanel();
    updateIncidentPanel();

    state.lastUpdated = new Date();
    document.getElementById('lastUpdated').textContent = 'Updated: ' + state.lastUpdated.toLocaleTimeString('en-MY');

    // Ensure loading is hidden after all operations
    setTimeout(() => showLoading(false), 100);
  } catch(e) {
    console.error('Data load error:', e);
    // Use demo data as fallback
    state.osmData = generateDemoOSMData();
    await loadTrafficData();
    generateIncidents();
    refreshDeckLayers();
    updateAnalytics();
    updateRoadPanel();
    updateIncidentPanel();
    document.getElementById('lastUpdated').textContent = 'Demo mode (offline)';
    setTimeout(() => showLoading(false), 100);
  }
}

// ===== OSM DATA =====
async function loadOSMData() {
  const { lat, lng } = state.center;
  const delta = 0.025;
  const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;

  const query = `[out:json][timeout:20];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${bbox});way["building"~"."](${bbox}););out geom;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(22000) });
    if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
    const data = await res.json();

    state.osmData.roads = data.elements.filter(e => e.type === 'way' && e.tags?.highway);
    state.osmData.buildings = data.elements.filter(e => e.type === 'way' && e.tags?.building);

    // Fallback if empty
    if (state.osmData.roads.length === 0) {
      const demo = generateDemoOSMData();
      state.osmData = demo;
    }
  } catch(e) {
    console.warn('Overpass fallback:', e.message);
    state.osmData = generateDemoOSMData();
  }
}

function generateDemoOSMData() {
  const { lat, lng } = state.center;
  const roads = [];
  const buildings = [];
  const hwTypes = ['primary', 'secondary', 'tertiary', 'residential', 'trunk', 'motorway'];

  for (let i = 0; i < 40; i++) {
    const sLat = lat + (Math.random() - 0.5) * 0.05;
    const sLng = lng + (Math.random() - 0.5) * 0.05;
    const eLat = sLat + (Math.random() - 0.5) * 0.025;
    const eLng = sLng + (Math.random() - 0.5) * 0.025;
    roads.push({
      type: 'way', id: i,
      tags: { highway: hwTypes[Math.floor(Math.random() * hwTypes.length)], name: `Jalan ${['Ampang','Cheras','Duta','Kuching','Sungai Besi','Raja Laut','Maharajalela','Imbi','Bukit Bintang'][i % 9]}` },
      geometry: [
        { lat: sLat, lon: sLng },
        { lat: (sLat + eLat) / 2 + (Math.random() - 0.5) * 0.005, lon: (sLng + eLng) / 2 + (Math.random() - 0.5) * 0.005 },
        { lat: eLat, lon: eLng }
      ]
    });
  }

  for (let i = 0; i < 80; i++) {
    const cLat = lat + (Math.random() - 0.5) * 0.04;
    const cLng = lng + (Math.random() - 0.5) * 0.04;
    const sz = 0.0002 + Math.random() * 0.0010;
    const levels = Math.floor(Math.random() * 30 + 1);
    buildings.push({
      type: 'way', id: 1000 + i,
      tags: { building: 'yes', 'building:levels': String(levels) },
      geometry: [
        { lat: cLat - sz, lon: cLng - sz },
        { lat: cLat + sz, lon: cLng - sz },
        { lat: cLat + sz, lon: cLng + sz },
        { lat: cLat - sz, lon: cLng + sz },
        { lat: cLat - sz, lon: cLng - sz }
      ]
    });
  }

  return { roads, buildings, pois: [] };
}

// ===== TRAFFIC DATA =====
async function loadTrafficData() {
  // Simulate TomTom-style flow data for each road
  state.tomtomData.segments = state.osmData.roads.map((road, i) => {
    const hwSpeed = { motorway: 110, trunk: 90, primary: 80, secondary: 70, tertiary: 60, residential: 50, unclassified: 50 };
    const freeflow = hwSpeed[road.tags?.highway] || 60;
    // More realistic: peak hour simulation
    const hour = new Date().getHours();
    const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
    const baseCong = isPeak ? 0.3 + Math.random() * 0.5 : 0.5 + Math.random() * 0.5;
    const currentSpeed = Math.round(freeflow * baseCong);
    const congestionLevel = baseCong < 0.45 ? 'high' : baseCong < 0.70 ? 'medium' : 'low';

    return {
      id: road.id,
      roadName: road.tags?.name || 'Unnamed Road',
      highway: road.tags?.highway || 'residential',
      currentSpeed,
      freeFlowSpeed: freeflow,
      confidence: 0.7 + Math.random() * 0.3,
      congestionLevel,
      geometry: road.geometry || []
    };
  });
}

// ===== INCIDENTS =====
function generateIncidents() {
  const { lat, lng } = state.center;
  const types = [
    { type: 'accident', label: 'Traffic Accident', severity: 'high' },
    { type: 'closure', label: 'Road Closure', severity: 'high' },
    { type: 'hazard', label: 'Road Hazard', severity: 'medium' },
    { type: 'construction', label: 'Construction Work', severity: 'medium' },
    { type: 'congestion', label: 'Heavy Congestion', severity: 'medium' },
    { type: 'stall', label: 'Vehicle Stall', severity: 'low' },
    { type: 'flooding', label: 'Flash Flood Alert', severity: 'high' },
    { type: 'police', label: 'Police Checkpoint', severity: 'low' }
  ];
  const roads = ['Jalan Ampang','Jalan Cheras','Jalan Duta','Jalan Kuching','Jalan Sungai Besi','Jalan Raja Laut','Lebuhraya KL-PJ','MEX Highway','DUKE Highway'];

  const count = 8 + Math.floor(Math.random() * 7);
  state.incidents = Array.from({ length: count }, (_, i) => {
    const t = types[Math.floor(Math.random() * types.length)];
    return {
      id: i, ...t,
      lat: lat + (Math.random() - 0.5) * 0.06,
      lng: lng + (Math.random() - 0.5) * 0.06,
      road: roads[Math.floor(Math.random() * roads.length)],
      time: Math.floor(Math.random() * 120) + ' min ago',
      delay: Math.floor(Math.random() * 25) + ' min delay'
    };
  });
}

// ===== DECK.GL =====
function refreshDeckLayers() {
  if (!state.map) return;

  const layers = buildDeckLayers();

  if (!state.deckOverlay) {
    // interleaved:true uses MapLibre's own WebGL context → perfect coord alignment at any pitch/zoom
    state.deckOverlay = new deck.MapboxOverlay({ interleaved: true, layers });
    state.map.addControl(state.deckOverlay);
  } else {
    state.deckOverlay.setProps({ layers });
  }
}

function buildDeckLayers() {
  const layers = [];

  // --- BUILDINGS 3D ---
  if (state.layers.buildings && state.osmData.buildings.length > 0) {
    const buildingData = state.osmData.buildings
      .filter(b => b.geometry && b.geometry.length >= 4)
      .map(b => ({
        polygon: b.geometry.map(g => [g.lon, g.lat]),
        levels: parseInt(b.tags?.['building:levels'] || '3'),
        height: parseInt(b.tags?.['building:levels'] || '3') * 3.5
      }));

    layers.push(new deck.PolygonLayer({
      id: 'buildings-3d',
      data: buildingData,
      getPolygon: d => d.polygon,
      getElevation: d => d.height * (state.extrusion / 50),
      getFillColor: () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        // Night (dark): deep maroon-purple  |  Day (light): warm grey-rose
        return isLight ? [200, 170, 190, Math.round(state.opacity * 210)] : [45, 15, 38, Math.round(state.opacity * 210)];
      },
      getLineColor: () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return isLight ? [181, 26, 138, 60] : [224, 59, 170, 55];
      },
      getLineWidth: 0.5,
      lineWidthMinPixels: 0.5,
      extruded: true,
      material: { ambient: 0.25, diffuse: 0.8, shininess: 20, specularColor: [181, 26, 138] },
      updateTriggers: { getFillColor: [state.opacity], getLineColor: [] },
      opacity: state.opacity * 0.85,
      pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        showTooltip(info.x, info.y, `<div class="tooltip-title">Building</div><div class="tooltip-row">Floors: ${info.object.levels}</div><div class="tooltip-row">Height: ~${Math.round(info.object.height)}m</div>`);
      }
    }));
  }

  // --- ROAD NETWORK ---
  if (state.layers.roads && state.osmData.roads.length > 0) {
    const pathData = state.osmData.roads
      .filter(r => r.geometry && r.geometry.length > 1)
      .map(road => {
        const seg = state.tomtomData.segments.find(s => s.id === road.id);
        return {
          path: road.geometry.map(g => [g.lon, g.lat]),
          congestion: seg?.congestionLevel || 'low',
          highway: road.tags?.highway || 'residential',
          name: road.tags?.name || 'Unknown Road',
          speed: seg?.currentSpeed || 0,
          freeflow: seg?.freeFlowSpeed || 60
        };
      });

    layers.push(new deck.PathLayer({
      id: 'roads',
      data: pathData,
      getPath: d => d.path,
      getColor: d => d.congestion === 'high' ? [255, 77, 77, 230] : d.congestion === 'medium' ? [255, 149, 0, 210] : [52, 211, 153, 180],
      getWidth: d => { const w = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, residential: 3, unclassified: 2 }; return (w[d.highway] || 3) * state.opacity; },
      widthUnits: 'pixels',
      widthMinPixels: 1.5,
      opacity: state.opacity,
      pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        const d = info.object;
        const pct = d.freeflow ? Math.round(d.speed / d.freeflow * 100) : 0;
        showTooltip(info.x, info.y, `<div class="tooltip-title">${d.name}</div><div class="tooltip-row">Type: ${d.highway}</div><div class="tooltip-row">Congestion: <strong style="color:${d.congestion === 'high' ? 'var(--red)' : d.congestion === 'medium' ? 'var(--orange)' : 'var(--green)'}">${d.congestion.toUpperCase()}</strong></div><div class="tooltip-row">Speed: ${d.speed}/${d.freeflow} km/h (${pct}%)</div>`);
      }
    }));
  }

  // --- TRAFFIC FLOW (ground-level path overlay, no floating arcs) ---
  if (state.layers.traffic && state.tomtomData.segments.length > 0) {
    const flowData = state.tomtomData.segments
      .filter(s => s.geometry && s.geometry.length >= 2)
      .map(s => ({
        path: s.geometry.map(g => [g.lon, g.lat]),
        speed: s.currentSpeed,
        freeflow: s.freeFlowSpeed,
        ratio: s.freeFlowSpeed > 0 ? s.currentSpeed / s.freeFlowSpeed : 1,
        name: s.roadName,
        highway: s.highway || 'residential'
      }));

    const hwW = { motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6, residential: 4, unclassified: 3 };

    layers.push(new deck.PathLayer({
      id: 'traffic-flow',
      data: flowData,
      getPath: d => d.path,
      // Pulsing animated color based on congestion ratio
      getColor: d => d.ratio < 0.45 ? [255, 77, 77, 200] : d.ratio < 0.70 ? [255, 149, 0, 180] : [52, 211, 153, 160],
      getWidth: d => (hwW[d.highway] || 4) * 1.6,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      widthMaxPixels: 18,
      opacity: state.opacity * 0.65,
      jointRounded: true,
      capRounded: true,
      pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        const d = info.object;
        showTooltip(info.x, info.y,
          `<div class="tooltip-title">${d.name} — Traffic Flow</div>` +
          `<div class="tooltip-row">Speed: ${d.speed} / ${d.freeflow} km∕h</div>` +
          `<div class="tooltip-row">Ratio: <strong>${Math.round(d.ratio * 100)}%</strong></div>`
        );
      }
    }));
  }

  // --- INCIDENTS ---
  if (state.layers.incidents && state.incidents.length > 0) {
    const incData = state.incidents.map(inc => ({ ...inc, position: [inc.lng, inc.lat] }));

    // Outer glow
    layers.push(new deck.ScatterplotLayer({
      id: 'incidents-glow',
      data: incData,
      getPosition: d => d.position,
      getRadius: d => d.severity === 'high' ? 100 : d.severity === 'medium' ? 75 : 55,
      getFillColor: d => d.severity === 'high' ? [255, 77, 77, 60] : d.severity === 'medium' ? [255, 149, 0, 55] : [251, 191, 36, 50],
      radiusUnits: 'meters',
      radiusMinPixels: 5, radiusMaxPixels: 22,
      opacity: 0.7,
      pickable: false
    }));

    // Inner dot
    layers.push(new deck.ScatterplotLayer({
      id: 'incidents',
      data: incData,
      getPosition: d => d.position,
      getRadius: d => d.severity === 'high' ? 40 : d.severity === 'medium' ? 28 : 20,
      getFillColor: d => d.severity === 'high' ? [255, 77, 77, 240] : d.severity === 'medium' ? [255, 149, 0, 220] : [251, 191, 36, 200],
      radiusUnits: 'meters',
      radiusMinPixels: 3, radiusMaxPixels: 14,
      opacity: 1,
      pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        const d = info.object;
        showTooltip(info.x, info.y, `<div class="tooltip-title">${d.label}</div><div class="tooltip-row">Road: ${d.road}</div><div class="tooltip-row">Severity: <strong style="color:${d.severity === 'high' ? 'var(--red)' : d.severity === 'medium' ? 'var(--orange)' : 'var(--yellow)'}">${d.severity.toUpperCase()}</strong></div><div class="tooltip-row">${d.time} · ${d.delay}</div>`);
      }
    }));
  }

  // --- HEATMAP ---
  if (state.layers.heatmap) {
    const heatData = [
      ...state.incidents.map(i => ({ position: [i.lng, i.lat], weight: i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1 })),
      ...state.tomtomData.segments.filter(s => s.congestionLevel === 'high' && s.geometry?.length > 0).map(s => ({ position: [s.geometry[0].lon, s.geometry[0].lat], weight: 2.5 }))
    ];

    if (heatData.length) {
      layers.push(new deck.HeatmapLayer({
        id: 'heatmap',
        data: heatData,
        getPosition: d => d.position,
        getWeight: d => d.weight,
        radiusPixels: 55,
        intensity: 1.8,
        threshold: 0.05,
        opacity: state.opacity * 0.55,
        colorRange: [
          [0, 180, 80, 80], [100, 230, 80, 120],
          [255, 215, 0, 160], [255, 140, 0, 200],
          [255, 69, 0, 220], [255, 0, 0, 240]
        ]
      }));
    }
  }

  // --- POI ---
  if (state.layers.poi && state.osmData.pois.length > 0) {
    layers.push(new deck.ScatterplotLayer({
      id: 'pois',
      data: state.osmData.pois,
      getPosition: d => [d.lon, d.lat],
      getRadius: 15,
      getFillColor: [52, 211, 153, 200],
      radiusUnits: 'meters',
      radiusMinPixels: 3, radiusMaxPixels: 8,
      opacity: state.opacity
    }));
  }

  // --- CAMERAS ---
  layers.push(...buildCameraLayer());

  return layers;
}

// ===== TOOLTIP =====
function showTooltip(x, y, html) {
  const t = document.getElementById('mapTooltip');
  t.innerHTML = html;
  t.style.display = 'block';
  t.style.left = (x + 15) + 'px';
  t.style.top = (y - 10) + 'px';
}
function hideTooltip() {
  document.getElementById('mapTooltip').style.display = 'none';
}

// ===== MAP CONTROLS =====
function setupMapControls() {
  document.getElementById('btnZoomIn').addEventListener('click', () => { if (state.map) state.map.zoomIn(); });
  document.getElementById('btnZoomOut').addEventListener('click', () => { if (state.map) state.map.zoomOut(); });
  document.getElementById('btnRotateReset').addEventListener('click', () => { if (state.map) { state.map.setBearing(0); state.map.setPitch(45); } });
  document.getElementById('btnFitArea').addEventListener('click', () => {
    if (state.map) state.map.flyTo({ center: [state.center.lng, state.center.lat], zoom: 13, speed: 1.2 });
  });
  document.getElementById('screenshotBtn').addEventListener('click', () => {
    alert('To export: use your browser\'s print-to-PDF or right-click the map area and save.');
  });
}

// ===== KPI =====
function updateKPIs({ congestion, incidents, roads, speed }) {
  document.getElementById('kpiCongestion').textContent = congestion;
  document.getElementById('kpiIncidents').textContent = incidents;
  document.getElementById('kpiRoads').textContent = roads;
  document.getElementById('kpiAvgSpeed').textContent = speed;
  // Sync mobile KPI strip
  const m = { mkpiCongestion: congestion, mkpiIncidents: incidents, mkpiRoads: roads, mkpiAvgSpeed: speed };
  Object.entries(m).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

// ===== ANALYTICS =====
function updateAnalytics() {
  const segs = state.tomtomData.segments;
  const avgSpeed = segs.length ? Math.round(segs.reduce((s, x) => s + x.currentSpeed, 0) / segs.length) : 0;
  const avgFreeflow = segs.length ? Math.round(segs.reduce((s, x) => s + x.freeFlowSpeed, 0) / segs.length) : 80;
  const congestionPct = Math.max(0, Math.round((1 - avgSpeed / avgFreeflow) * 100));
  const highIncidents = state.incidents.filter(i => i.severity === 'high').length;

  updateKPIs({ congestion: congestionPct + '%', incidents: state.incidents.length, roads: state.osmData.roads.length, speed: avgSpeed + ' km/h' });

  document.getElementById('aValCI').textContent = congestionPct + '%';
  document.getElementById('aBarCI').style.width = congestionPct + '%';

  document.getElementById('aValSpeed').textContent = avgSpeed + ' km/h';
  document.getElementById('aBarSpeed').style.width = Math.min(avgSpeed / avgFreeflow * 100, 100) + '%';

  document.getElementById('aValDensity').textContent = state.osmData.roads.length + ' segments';
  document.getElementById('aBarDensity').style.width = Math.min(state.osmData.roads.length / 60 * 100, 100) + '%';

  document.getElementById('aValIncident').textContent = highIncidents + ' critical';
  document.getElementById('aBarIncident').style.width = Math.min(highIncidents / 5 * 100, 100) + '%';
}

// ===== ROAD PANEL =====
function updateRoadPanel() {
  const segs = state.tomtomData.segments;
  const hwCounts = {};
  state.osmData.roads.forEach(r => { const hw = r.tags?.highway || 'unknown'; hwCounts[hw] = (hwCounts[hw] || 0) + 1; });

  document.getElementById('roadStats').innerHTML = `
    ${[
      { label: 'Total Road Segments (OSM)', val: state.osmData.roads.length, badge: 'badge-blue', text: 'Loaded' },
      { label: 'High Congestion Segments', val: segs.filter(s => s.congestionLevel === 'high').length, badge: 'badge-red', text: 'Critical' },
      { label: 'Moderate Congestion', val: segs.filter(s => s.congestionLevel === 'medium').length, badge: 'badge-yellow', text: 'Warning' },
      { label: 'Buildings (3D)', val: state.osmData.buildings.length, badge: 'badge-green', text: '3D Ready' },
      ...Object.entries(hwCounts).slice(0, 4).map(([hw, count]) => ({ label: hw[0].toUpperCase() + hw.slice(1) + ' Roads', val: count, badge: 'badge-blue', text: 'OSM' }))
    ].map(r => `
      <div class="road-stat-card">
        <div class="road-stat-label">${r.label}</div>
        <div class="road-stat-value">${r.val}</div>
        <span class="road-stat-badge ${r.badge}">${r.text}</span>
      </div>`).join('')}
  `;
}

// ===== INCIDENT PANEL =====
function updateIncidentPanel() {
  const sorted = [...state.incidents].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
  const colors = { high: 'var(--red)', medium: 'var(--orange)', low: 'var(--yellow)' };
  const bgColors = { high: 'rgba(255,77,77,0.15)', medium: 'rgba(255,149,0,0.15)', low: 'rgba(251,191,36,0.15)' };

  document.getElementById('incidentList').innerHTML = sorted.map((inc, i) => `
    <div class="incident-card ${inc.severity}" data-idx="${i}" data-testid="incident-${inc.id}">
      <div class="incident-icon" style="background:${bgColors[inc.severity]};color:${colors[inc.severity]}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div class="incident-info">
        <div class="incident-title">${inc.label}</div>
        <div class="incident-meta"><span>${inc.road}</span><span>${inc.time}</span><span>${inc.delay}</span></div>
      </div>
    </div>`).join('');

  document.getElementById('incidentList').querySelectorAll('.incident-card').forEach(card => {
    card.addEventListener('click', () => {
      const inc = sorted[+card.dataset.idx];
      if (state.map) state.map.flyTo({ center: [inc.lng, inc.lat], zoom: 16, speed: 1.5 });
    });
  });
}

// ===== LOADING STATE =====
function showLoading(show, text = '') {
  const el = document.getElementById('mapLoading');
  if (show) { el.classList.remove('hidden'); if (text) document.querySelector('.loading-text').textContent = text; }
  else el.classList.add('hidden');
}
function setLoadingDetail(text) {
  document.getElementById('loadingDetail').textContent = text;
}

// ===== MALAYSIA HIGHWAY CAMERAS (OSINT curated dataset) =====
const MY_CAMERAS = [
  // KL / KLCC / Ampang area
  { id:'MY001', name:'Plaza Tol Ampang', road:'Jalan Ampang', lat:3.1580, lng:101.7370, source:'my', operator:'PLUS Expressways' },
  { id:'MY002', name:'KLCC Approach (Jln P. Ramlee)', road:'Jalan P. Ramlee', lat:3.1577, lng:101.7123, source:'my', operator:'KLCCC' },
  { id:'MY003', name:'Bukit Bintang / Jln Imbi', road:'Jalan Imbi', lat:3.1463, lng:101.7114, source:'my', operator:'KLCCC' },
  { id:'MY004', name:'Masjid India / Jln TAR', road:'Jalan Tuanku Abdul Halim', lat:3.1501, lng:101.6957, source:'my', operator:'DBKL' },
  { id:'MY005', name:'Chow Kit Roundabout', road:'Jalan Chow Kit', lat:3.1656, lng:101.6966, source:'my', operator:'DBKL' },
  // DUKE / AKLEH / SMART
  { id:'MY006', name:'DUKE Highway KM12', road:'DUKE Highway', lat:3.1921, lng:101.6855, source:'my', operator:'DUKE' },
  { id:'MY007', name:'AKLEH Toll Ampang', road:'Ampang–KL Elevated Hwy', lat:3.1510, lng:101.7455, source:'my', operator:'AKLEH' },
  { id:'MY008', name:'SMART Tunnel Entrance', road:'Jalan Sungai Besi', lat:3.1210, lng:101.7032, source:'my', operator:'SMART' },
  // PLUS North
  { id:'MY009', name:'Plaza Tol Juru (Penang)', road:'North-South Expressway', lat:5.3785, lng:100.4560, source:'my', operator:'PLUS' },
  { id:'MY010', name:'Juru Interchange (E1)', road:'E1 North-South Expressway', lat:5.3792, lng:100.4604, source:'my', operator:'PLUS' },
  { id:'MY011', name:'Bertam Toll (Kepala Batas)', road:'E1 North-South Expressway', lat:5.5233, lng:100.4218, source:'my', operator:'PLUS' },
  // PLUS South
  { id:'MY012', name:'Seremban R&R (Southbound)', road:'E2 South Expressway', lat:2.7319, lng:101.9512, source:'my', operator:'PLUS' },
  { id:'MY013', name:'Ayer Keroh Interchange (Melaka)', road:'E1 North-South Expressway', lat:2.2789, lng:102.2903, source:'my', operator:'PLUS' },
  // JB / Southern
  { id:'MY014', name:'Kotaraya Interchange (JB)', road:'E2 Expressway JB', lat:1.4564, lng:103.7478, source:'my', operator:'PLUS' },
  { id:'MY015', name:'Skudai Toll Northbound', road:'E5 Skudai Expressway', lat:1.5113, lng:103.6762, source:'my', operator:'PLUS' },
  // Seri Kembangan / SE Klang Valley
  { id:'MY016', name:'Seri Kembangan KM7', road:'Besraya Expressway', lat:3.0363, lng:101.7118, source:'my', operator:'Besraya' },
  { id:'MY017', name:'Kajang SILK Toll', road:'SILK Highway', lat:2.9929, lng:101.7880, source:'my', operator:'SILK' },
  { id:'MY018', name:'MEX KL-Seremban KM5', road:'MEX Highway', lat:3.0810, lng:101.7010, source:'my', operator:'MEX' },
  // KL City Centre routes
  { id:'MY019', name:'Jln Syed Putra / Federal Hwy', road:'Federal Highway', lat:3.1220, lng:101.6764, source:'my', operator:'LLM' },
  { id:'MY020', name:'Jln Kinabalu (KL Ring Road)', road:'KL Middle Ring Road', lat:3.1671, lng:101.7093, source:'my', operator:'DBKL' },
];

// ===== CAMERA DATA LOADING =====
async function loadCameraData() {
  const results = [];

  // 1. Singapore LTA live cameras
  try {
    const res = await fetch('https://api.data.gov.sg/v1/transport/traffic-images', {
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const json = await res.json();
      const items = json.items?.[0]?.cameras || [];
      items.forEach(cam => {
        results.push({
          id: 'SG' + cam.camera_id,
          name: 'Camera ' + cam.camera_id,
          road: 'Singapore Expressway',
          lat: cam.location.latitude,
          lng: cam.location.longitude,
          source: 'sg',
          operator: 'LTA Singapore',
          imageUrl: cam.image,
          timestamp: cam.timestamp
        });
      });
      const el = document.getElementById('statusLTA');
      if (el) el.textContent = '\u25cf Online (' + items.length + ' cameras)';
    }
  } catch(e) {
    console.warn('LTA camera fetch failed:', e.message);
    const el = document.getElementById('statusLTA');
    if (el) el.textContent = '\u25cf Unavailable';
  }

  // 2. OSM surveillance nodes — map pins only (no grid cards, no imageUrl)
  try {
    const { lat, lng } = state.center;
    const delta = 0.05;
    const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;
    const query = `[out:json][timeout:12];node["man_made"="surveillance"](${bbox});out body;`;
    const res2 = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(14000)
    });
    if (res2.ok) {
      const data = await res2.json();
      data.elements.forEach(node => {
        cameraState.osmNodes.push({   // stored separately — map layer only
          id: 'OSM' + node.id,
          name: node.tags?.name || node.tags?.['surveillance:type'] || 'Surveillance Camera',
          road: node.tags?.['addr:street'] || 'OSM Mapped Location',
          lat: node.lat,
          lng: node.lon,
          source: 'osm',
          operator: node.tags?.operator || 'Unknown'
        });
      });
      const el2 = document.getElementById('statusOSMCam');
      if (el2) el2.textContent = '\u25cf Online (' + data.elements.length + ' nodes)';
    }
  } catch(e) {
    console.warn('OSM surveillance fetch failed:', e.message);
    const el = document.getElementById('statusOSMCam');
    if (el) el.textContent = '\u25cf Unavailable';
  }

  // Only cameras with confirmed live image URLs go into the grid
  cameraState.cameras = results.filter(c => !!c.imageUrl);
  // Malaysia highway positions kept as OSINT map pins only (separate array)
  cameraState.myNodes = MY_CAMERAS.map(c => ({ ...c, imageUrl: null }));

  applyCameraFilter();
  renderCameraGrid();
  refreshDeckLayers();
}

function applyCameraFilter() {
  const f = cameraState.activeFilter;
  // Only live cameras shown in grid — filter by source if needed
  cameraState.filtered = f === 'all' || f === 'sg' ? cameraState.cameras : [];
  const cnt = document.getElementById('camCount');
  if (cnt) cnt.textContent = cameraState.filtered.length + ' live feeds';
  const src = document.getElementById('camSource');
  if (src) src.textContent = { all: 'All Live Sources', sg: 'Singapore LTA', my: 'Malaysia Highway (map pins)', osm: 'OSM Surveillance (map pins)' }[f] || 'All Live Sources';
}

function renderCameraGrid() {
  const grid = document.getElementById('cameraGrid');
  if (!grid) return;
  if (!cameraState.filtered.length) {
    grid.innerHTML = '<div class="cam-loading">No cameras available for this filter.</div>';
    return;
  }
  grid.innerHTML = cameraState.filtered.map(cam => {
    const srcColor = { sg: '#e03baa', my: '#34d399', osm: '#a78bfa' }[cam.source] || '#9ba3af';
    const srcLabel = { sg: 'LTA SG', my: 'MY HWY', osm: 'OSM' }[cam.source] || 'CAM';
    const hasImage = !!cam.imageUrl;
    return `
    <div class="cam-card" data-id="${cam.id}" data-testid="cam-card-${cam.id}" title="${cam.name}">
      <div class="cam-card-img-wrap">
        ${hasImage
          ? `<img class="cam-card-img" src="${cam.imageUrl}" alt="${cam.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
          : ''}
        <div class="cam-card-no-img" style="${hasImage ? 'display:none' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28" style="opacity:.4"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </div>
        <div class="cam-card-badge" style="background:${srcColor}">${srcLabel}</div>
        ${hasImage ? '<div class="cam-card-live">LIVE</div>' : ''}
      </div>
      <div class="cam-card-info">
        <div class="cam-card-name">${cam.name.length > 28 ? cam.name.substring(0, 28) + '\u2026' : cam.name}</div>
        <div class="cam-card-road">${cam.road.length > 32 ? cam.road.substring(0, 32) + '\u2026' : cam.road}</div>
      </div>
    </div>`;
  }).join('');

  // Bind click
  grid.querySelectorAll('.cam-card').forEach(card => {
    card.addEventListener('click', () => {
      const cam = cameraState.cameras.find(c => c.id === card.dataset.id);
      if (cam) openCameraModal(cam);
    });
  });
}

// ===== CAMERA MAP LAYER =====
function buildCameraLayer() {
  if (!state.layers.cameras) return [];
  const layers = [];

  // -- LIVE SG cameras (pink) --
  if (cameraState.cameras.length) {
    const sgData = cameraState.cameras.map(c => ({ position: [c.lng, c.lat], id: c.id, name: c.name, source: 'sg', road: c.road }));
    layers.push(new deck.ScatterplotLayer({
      id: 'cameras-sg-glow',
      data: sgData,
      getPosition: d => d.position,
      getRadius: 28,
      getFillColor: [224, 59, 170, 50],
      radiusUnits: 'meters', radiusMinPixels: 4, radiusMaxPixels: 14,
      opacity: 0.9, pickable: false
    }));
    layers.push(new deck.ScatterplotLayer({
      id: 'cameras-sg',
      data: sgData,
      getPosition: d => d.position,
      getRadius: 12,
      getFillColor: [224, 59, 170, 230],
      getLineColor: [255, 255, 255, 200],
      lineWidthMinPixels: 1.5, stroked: true,
      radiusUnits: 'meters', radiusMinPixels: 3, radiusMaxPixels: 11,
      opacity: 1, pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        showTooltip(info.x, info.y,
          `<div class="tooltip-title">\u{1F4F9} ${info.object.name}</div><div class="tooltip-row">LTA Singapore • Live Feed</div><div class="tooltip-row">${info.object.road}</div><div class="tooltip-row" style="color:var(--accent);font-size:10px;margin-top:2px">Click to view live image</div>`);
      },
      onClick: info => {
        if (!info.object) return;
        const cam = cameraState.cameras.find(c => c.id === info.object.id);
        if (cam) openCameraModal(cam);
      }
    }));
  }

  // -- Malaysia highway pins (green, no image) --
  if (cameraState.myNodes.length) {
    const myData = cameraState.myNodes.map(c => ({ position: [c.lng, c.lat], id: c.id, name: c.name, road: c.road, operator: c.operator }));
    layers.push(new deck.ScatterplotLayer({
      id: 'cameras-my',
      data: myData,
      getPosition: d => d.position,
      getRadius: 10,
      getFillColor: [52, 211, 153, 180],
      getLineColor: [255, 255, 255, 160],
      lineWidthMinPixels: 1, stroked: true,
      radiusUnits: 'meters', radiusMinPixels: 2, radiusMaxPixels: 9,
      opacity: 0.9, pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        showTooltip(info.x, info.y,
          `<div class="tooltip-title">\u{1F4CD} ${info.object.name}</div><div class="tooltip-row">Malaysia Highway • ${info.object.operator}</div><div class="tooltip-row">${info.object.road}</div><div class="tooltip-row" style="color:#34d399;font-size:10px;margin-top:2px">OSINT position — no live stream</div>`);
      }
    }));
  }

  // -- OSM surveillance nodes (purple, no image) --
  if (cameraState.osmNodes.length) {
    const osmData = cameraState.osmNodes.map(c => ({ position: [c.lng, c.lat], id: c.id, name: c.name }));
    layers.push(new deck.ScatterplotLayer({
      id: 'cameras-osm',
      data: osmData,
      getPosition: d => d.position,
      getRadius: 8,
      getFillColor: [167, 139, 250, 160],
      getLineColor: [255, 255, 255, 120],
      lineWidthMinPixels: 1, stroked: true,
      radiusUnits: 'meters', radiusMinPixels: 2, radiusMaxPixels: 8,
      opacity: 0.85, pickable: true,
      onHover: info => {
        if (!info.object) { hideTooltip(); return; }
        showTooltip(info.x, info.y,
          `<div class="tooltip-title">\u{1F6A6} ${info.object.name}</div><div class="tooltip-row">OSM Surveillance Node</div><div class="tooltip-row" style="color:#a78bfa;font-size:10px;margin-top:2px">Community-mapped CCTV position</div>`);
      }
    }));
  }

  return layers;
}

// ===== CAMERA MODAL =====
function openCameraModal(cam) {
  cameraState.openCamera = cam;
  const backdrop = document.getElementById('camModalBackdrop');
  const img = document.getElementById('camModalImg');
  const err = document.getElementById('camModalError');
  const pulse = document.getElementById('camModalPulse');

  document.getElementById('camModalTitle').textContent = cam.name;
  document.getElementById('camModalLocation').textContent = cam.road;
  document.getElementById('camModalSource').textContent =
    ({ sg: 'LTA Singapore (data.gov.sg)', my: 'Malaysia Highway OSINT Dataset', osm: 'OpenStreetMap Surveillance Node' }[cam.source] || cam.source) +
    (cam.operator ? ' • ' + cam.operator : '');
  document.getElementById('camModalCoords').textContent =
    cam.lat.toFixed(5) + ', ' + cam.lng.toFixed(5);
  document.getElementById('camModalUpdated').textContent =
    cam.timestamp ? 'Last seen: ' + new Date(cam.timestamp).toLocaleTimeString('en-MY') : 'Live feed';

  // Update badge
  const badge = document.getElementById('camModalBadge');
  badge.textContent = cam.imageUrl ? 'LIVE' : 'OSINT';
  badge.style.background = cam.imageUrl ? '#e03baa' : '#a78bfa';

  if (cam.imageUrl) {
    img.style.display = 'block';
    err.classList.add('hidden');
    pulse.style.display = 'block';
    img.src = '';
    // Cache-bust for live reload
    img.src = cam.imageUrl + (cam.imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
    img.onload = () => { pulse.style.display = 'none'; };
    img.onerror = () => {
      img.style.display = 'none';
      err.classList.remove('hidden');
      pulse.style.display = 'none';
    };
  } else {
    img.style.display = 'none';
    err.classList.remove('hidden');
    err.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="opacity:.4;margin-bottom:8px"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span>No live stream — OSINT position only</span><br><small style="opacity:.6;margin-top:4px;display:block">Location data sourced from OSM / highway operator OSINT</small>';
    pulse.style.display = 'none';
  }

  backdrop.classList.add('active');

  // Fly map to camera
  if (state.map) state.map.flyTo({ center: [cam.lng, cam.lat], zoom: 16, speed: 1.4 });

  // Auto-refresh live feeds every 20s
  clearInterval(cameraState.modalRefreshTimer);
  if (cam.imageUrl) {
    cameraState.modalRefreshTimer = setInterval(() => {
      if (cameraState.openCamera?.id === cam.id && img.style.display !== 'none') {
        img.src = cam.imageUrl + (cam.imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
        document.getElementById('camModalUpdated').textContent = 'Refreshed: ' + new Date().toLocaleTimeString('en-MY');
      }
    }, 20000);
  }
}

function closeCameraModal() {
  document.getElementById('camModalBackdrop').classList.remove('active');
  clearInterval(cameraState.modalRefreshTimer);
  cameraState.openCamera = null;
}

function setupCameraModal() {
  document.getElementById('camModalClose').addEventListener('click', closeCameraModal);
  document.getElementById('camModalBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('camModalBackdrop')) closeCameraModal();
  });
  document.getElementById('camModalRefresh').addEventListener('click', () => {
    if (cameraState.openCamera) openCameraModal(cameraState.openCamera);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCameraModal();
  });
}

function setupCameraControls() {
  document.getElementById('camRefreshBtn').addEventListener('click', function() {
    this.classList.add('spinning');
    loadCameraData().then(() => setTimeout(() => this.classList.remove('spinning'), 600));
  });
  document.getElementById('camFilter').addEventListener('change', e => {
    cameraState.activeFilter = e.target.value;
    applyCameraFilter();
    renderCameraGrid();
    refreshDeckLayers();
  });
  // Auto-refresh camera thumbnails every 30s
  cameraState.refreshTimer = setInterval(() => {
    if (cameraState.cameras.length) {
      // Only refresh LTA images (they have live URLs)
      cameraState.cameras.forEach(cam => {
        if (cam.source === 'sg') {
          // Will be refreshed on next loadCameraData()
        }
      });
    }
  }, 30000);
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', init);

// ===== AI JOURNEY PLANNER =====

const AI_SOS = {
  'PLUS Hotline': '1800-88-0000',
  'EMAS (Highway Patrol)': '1800-22-3277',
  'Police (POLIS)': '999',
  'Fire & Rescue (BOMBA)': '994',
  'Ambulance': '999',
  'AES / JPJ Traffic': '1800-22-0000',
  'JKR Road Defects': '1800-88-2525',
  'Road Transport Dept (JPJ)': '1800-88-5151',
  'Prasarana (LRT/BRT)': '1800-38-8228',
};

const AI_TOLLS = {
  'kl penang': { cost: 54.40, name: 'KL–Penang (PLUS North-South)' },
  'penang kl': { cost: 54.40, name: 'KL–Penang (PLUS North-South)' },
  'kl jb': { cost: 58.10, name: 'KL–JB (PLUS North-South)' },
  'jb kl': { cost: 58.10, name: 'KL–JB (PLUS North-South)' },
  'kl johor bahru': { cost: 58.10, name: 'KL–JB (PLUS North-South)' },
  'johor bahru kl': { cost: 58.10, name: 'KL–JB (PLUS North-South)' },
  'kl ipoh': { cost: 22.90, name: 'KL–Ipoh (PLUS)' },
  'ipoh kl': { cost: 22.90, name: 'KL–Ipoh (PLUS)' },
  'smart tunnel': { cost: 3.50, name: 'SMART Tunnel (avg)' },
  'duke': { cost: 2.50, name: 'DUKE Highway (avg)' },
  'mex': { cost: 2.80, name: 'MEX Highway (avg)' },
  'besraya': { cost: 2.00, name: 'Besraya Highway (avg)' },
  'kesas': { cost: 2.50, name: 'KESAS Highway (avg)' },
  'lpt': { cost: 18.00, name: 'LPT (KL–Kuantan, avg)' },
  'kl kuantan': { cost: 18.00, name: 'LPT (KL–Kuantan)' },
  'kl melaka': { cost: 12.30, name: 'KL–Melaka (PLUS)' },
  'melaka kl': { cost: 12.30, name: 'KL–Melaka (PLUS)' },
};

let aiPlannerOpen = false;

function setupAIPlanner() {
  const fab = document.getElementById('aiFab');
  const panel = document.getElementById('aiPanel');
  const closeBtn = document.getElementById('aiPanelClose');
  if (!fab || !panel) return;

  fab.addEventListener('click', () => toggleAIPanel());
  closeBtn.addEventListener('click', () => toggleAIPanel(false));

  // Quick chips
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.prompt || chip.dataset.query;
      if (q) processAIInput(q);
    });
  });

  // Input send
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  if (input && sendBtn) {
    sendBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (val) { input.value = ''; processAIInput(val); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) { input.value = ''; processAIInput(val); }
      }
    });
  }
}

function toggleAIPanel(forceState) {
  aiPlannerOpen = forceState !== undefined ? forceState : !aiPlannerOpen;
  const panel = document.getElementById('aiPanel');
  const fab = document.getElementById('aiFab');
  if (!panel) return;
  if (aiPlannerOpen) {
    panel.classList.add('open');
    fab && fab.classList.add('active');
    // focus input
    setTimeout(() => document.getElementById('aiInput')?.focus(), 300);
  } else {
    panel.classList.remove('open');
    fab && fab.classList.remove('active');
  }
}

function addUserMessage(text) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg-user';
  el.innerHTML = `<div class="ai-msg-bubble">${escapeHTML(text)}</div>`;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function addBotMessage(html) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return;
  // Remove typing indicator if present
  hideTypingIndicator();
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg-bot';
  el.innerHTML = `
    <div class="ai-msg-avatar">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M12 8l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="ai-msg-bubble">${html}</div>`;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTypingIndicator() {
  const msgs = document.getElementById('aiMessages');
  if (!msgs || document.getElementById('aiTyping')) return;
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg-bot ai-typing';
  el.id = 'aiTyping';
  el.innerHTML = `
    <div class="ai-msg-avatar">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M12 8l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="ai-msg-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideTypingIndicator() {
  document.getElementById('aiTyping')?.remove();
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function processAIInput(text) {
  addUserMessage(text);
  showTypingIndicator();

  const lower = text.toLowerCase();

  // Route: SOS
  if (lower.includes('sos') || lower.includes('emergency') || lower.includes('help') || lower.includes('accident')) {
    await delay(500);
    addBotMessage(buildSOSResponse());
    return;
  }

  // Route: Best time to travel (standalone query without explicit A→B)
  const isBestTimeQuery = lower.includes('best time') || lower.includes('good time') ||
    lower.includes('when to travel') || lower.includes('when should i') ||
    lower.includes('less traffic') || lower.includes('avoid traffic') ||
    lower.includes('least traffic') || lower.includes('lightest traffic') ||
    lower.includes('shortest time') || lower.includes('fastest time') ||
    lower.includes('when is traffic') || lower.includes('traffic forecast');

  if (isBestTimeQuery) {
    // Try to extract a journey pair; fall back to generic KL commute
    const journey = parseJourneyQuery(text);
    if (journey) {
      // Full journey plan which includes the timeline
      await planJourney(journey.from, journey.to);
      return;
    }
    // Standalone: show 24h forecast for a generic 30-min commute
    await delay(400);
    const d = new Date();
    const dayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const html = buildBestTimeHtml(30, 'Your Origin', 'Your Destination');
    addBotMessage(`
      <div style="margin-bottom:6px;font-size:12px;opacity:.75">General Klang Valley traffic forecast — ${dayLabel}</div>
      ${html}
      <div style="margin-top:8px;font-size:11px;opacity:.65">Tip: Ask "Best time from Seri Kembangan to KLCC" for a personalised forecast with petrol &amp; EV chargers along your route.</div>
    `);
    return;
  }

  // Route: Petrol
  if ((lower.includes('petrol') || lower.includes('fuel') || lower.includes('station') || lower.includes('minyak')) && !lower.includes('from') && !lower.includes('route') && !lower.includes('to ')) {
    const center = state.map ? state.map.getCenter() : { lng: 101.6869, lat: 3.1390 };
    await delay(600);
    const html = await buildNearbyPOI(center.lat, center.lng, 'fuel', '⛽ Petrol Stations', 'petrol');
    addBotMessage(html);
    return;
  }

  // Route: EV Charging
  if (lower.includes('ev') || lower.includes('electric') || lower.includes('charging') || lower.includes('charger')) {
    const center = state.map ? state.map.getCenter() : { lng: 101.6869, lat: 3.1390 };
    await delay(600);
    const html = await buildNearbyPOI(center.lat, center.lng, 'charging_station', '🔋 EV Charging Stations', 'ev');
    addBotMessage(html);
    return;
  }

  // Route: Journey planning
  const journey = parseJourneyQuery(text);
  if (journey) {
    await planJourney(journey.from, journey.to);
    return;
  }

  // Fallback
  await delay(400);
  addBotMessage(`
    <div>I can help you with:</div>
    <ul class="ai-feature-list">
      <li>🗺️ <strong>Route planning</strong> — "Plan route from KL to Penang"</li>
      <li>🕒 <strong>Best time to travel</strong> — "Best time from Seri Kembangan to KLCC"</li>
      <li>⛽ <strong>Petrol stations</strong> — "Find petrol near me"</li>
      <li>🔋 <strong>EV charging</strong> — "EV charging stations nearby"</li>
      <li>🆘 <strong>SOS / Emergency</strong> — "SOS numbers"</li>
    </ul>
    <div style="margin-top:8px;font-size:11px;opacity:.7">Tip: Try "Best time from Seri Kembangan to KLCC" for smart travel timing.</div>
  `);
}

function parseJourneyQuery(text) {
  const t = text.toLowerCase();
  // Patterns: "from X to Y", "X to Y", "route X to Y"
  const patterns = [
    /(?:plan\s+)?(?:my\s+)?(?:journey\s+)?(?:route\s+)?from\s+(.+?)\s+to\s+(.+)/i,
    /(?:plan\s+)?(?:route\s+)?(?:from\s+)?(.+?)\s+to\s+(.+)/i,
    /(.+?)\s*[-–→]\s*(.+)/i,
  ];
  // Trailing noise words to strip from the destination
  const trailNoise = /\s+(today|now|this\s+morning|tonight|by\s+car|by\s+road|by\s+driving|by\s+vehicle|via\s+\w+)?\??\s*$/i;
  for (const pat of patterns) {
    const m = t.match(pat);
    if (m) {
      const from = m[1].replace(/^(plan|my|journey|route|from|go|travel|drive|best\s+time)\s+/ig,'').trim();
      let to = m[2].replace(/\s+by\s+(car|road|driving|vehicle).*$/i,'');
      to = to.replace(trailNoise, '').trim();
      if (from.length > 1 && to.length > 1) return { from, to };
    }
  }
  return null;
}

async function planJourney(fromText, toText, opts = {}) {
  showTypingIndicator();
  try {
    // Geocode both
    const [fromCoord, toCoord] = await Promise.all([
      geocode(fromText),
      geocode(toText),
    ]);

    if (!fromCoord) { addBotMessage(`❌ Could not find location: <strong>${escapeHTML(fromText)}</strong>. Try a more specific place name.`); return; }
    if (!toCoord) { addBotMessage(`❌ Could not find location: <strong>${escapeHTML(toText)}</strong>. Try a more specific place name.`); return; }

    // OSRM routing
    const route = await getOSRMRoute(fromCoord, toCoord);
    const distKm = route ? route.distance / 1000 : haversineKm(fromCoord, toCoord);
    const durationMin = route ? route.duration / 60 : (distKm / 60) * 60; // 60km/h avg

    // Calculations
    const avgConsumption = 8; // L/100km default
    const fuelL = (distKm / 100) * avgConsumption;
    const ron95 = 2.05; // RM/L
    const fuelCost = fuelL * ron95;

    // Toll lookup
    const tollMatch = findToll(fromText, toText);
    const tollCost = tollMatch ? tollMatch.cost : null;
    const totalCost = fuelCost + (tollCost || 0);

    // ETA — adjust for current traffic
    const now = new Date();
    const currHour = now.getHours();
    const profile = getTrafficProfile();
    const currCongestion = profile[currHour];
    const adjustedMin = adjustedDuration(durationMin, currCongestion);
    const etaStr = formatMins(adjustedMin);
    const baseEtaStr = formatMins(durationMin);

    // Route waypoints for accurate POI placement
    const waypoints = (route && route.waypoints && route.waypoints.length > 0)
      ? route.waypoints
      : [{ lat: fromCoord.lat, lng: fromCoord.lng },
         { lat: (fromCoord.lat + toCoord.lat) / 2, lng: (fromCoord.lng + toCoord.lng) / 2 },
         { lat: toCoord.lat, lng: toCoord.lng }];

    const midLat = (fromCoord.lat + toCoord.lat) / 2;
    const midLng = (fromCoord.lng + toCoord.lng) / 2;

    // Fetch petrol + EV along route (using real waypoints) AND best-time HTML in parallel
    const [petrolHtml, evHtml] = await Promise.all([
      buildRoutePOIHtml(waypoints, 'fuel', 'petrol', distKm),
      buildRoutePOIHtml(waypoints, 'charging_station', 'ev', distKm),
    ]);

    // Best time timeline for this route
    const fromName = fromCoord.name || fromText;
    const toName   = toCoord.name   || toText;
    const bestTimeHtml = buildBestTimeHtml(durationMin, fromName, toName);

    // Fly map to midpoint
    if (state.map) state.map.flyTo({ center: [midLng, midLat], zoom: 9, speed: 1.2 });

    // Traffic status chip for current time
    const congInfo = CONGESTION_LABEL(currCongestion);
    const trafficChip = `<span class="traffic-now-chip ${congInfo.cls}-chip">${congInfo.label} now</span>`;

    addBotMessage(`
      <div class="journey-header">🗺️ Route: <strong>${escapeHTML(fromName)}</strong> → <strong>${escapeHTML(toName)}</strong> ${trafficChip}</div>
      <table class="journey-table">
        <tr><td>📍 Distance</td><td><strong>${distKm.toFixed(1)} km</strong></td></tr>
        <tr><td>⏱️ Est. Travel Time</td><td><strong>${etaStr}</strong> <span class="eta-note">(base ${baseEtaStr}, adj. for traffic)</span></td></tr>
        <tr><td>⛽ Fuel Used</td><td><strong>${fuelL.toFixed(1)} L</strong> @ 8L/100km</td></tr>
        <tr><td>💰 Fuel Cost</td><td><strong>RM ${fuelCost.toFixed(2)}</strong> (RON95 RM2.05/L)</td></tr>
        ${tollCost !== null ? `<tr><td>🛣️ Toll (est.)</td><td><strong>RM ${tollCost.toFixed(2)}</strong> — ${tollMatch.name}</td></tr>` : ''}
        <tr class="total-row"><td>💳 Total Est. Cost</td><td><strong>RM ${totalCost.toFixed(2)}</strong></td></tr>
      </table>

      <div class="poi-section">
        <div class="poi-label">⛽ Petrol Along Route</div>
        ${petrolHtml}
      </div>
      <div class="poi-section">
        <div class="poi-label">🔋 EV Charging Along Route</div>
        ${evHtml}
      </div>

      <div class="best-time-section">
        ${bestTimeHtml}
      </div>

      <div class="sos-mini">
        🆘 Emergency: <a href="tel:999">POLIS/AMB 999</a> · <a href="tel:18008880000">PLUS 1800-88-0000</a> · <a href="tel:18002223277">EMAS 1800-22-3277</a>
      </div>
    `);
  } catch(e) {
    console.error('Journey planner error:', e);
    addBotMessage('⚠️ Route calculation encountered an issue. Please check your location names and try again.');
  }
}

async function geocode(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=my,sg&format=json&limit=1&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await r.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: data[0].display_name.split(',')[0],
      };
    }
    return null;
  } catch(e) { return null; }
}

async function getOSRMRoute(from, to) {
  try {
    // overview=full returns encoded geometry; steps=true gives leg waypoints
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson&steps=false`;
    const r = await fetch(url);
    const data = await r.json();
    if (data && data.routes && data.routes[0]) {
      const route = data.routes[0];
      // Extract evenly-spaced waypoints along the route geometry
      const coords = route.geometry?.coordinates || [];
      const waypoints = sampleRouteWaypoints(coords, 5); // 5 points along route
      return {
        distance: route.distance,
        duration: route.duration,
        waypoints // [{lat, lng}, ...] sampled along real route
      };
    }
    return null;
  } catch(e) { return null; }
}

// Sample N evenly-spaced [lng,lat] coords from OSRM GeoJSON geometry
function sampleRouteWaypoints(coords, n) {
  if (!coords || coords.length === 0) return [];
  if (coords.length <= n) return coords.map(c => ({ lat: c[1], lng: c[0] }));
  const step = (coords.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const c = coords[Math.round(i * step)];
    return { lat: c[1], lng: c[0] };
  });
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function findToll(from, to) {
  const key = `${from.toLowerCase()} ${to.toLowerCase()}`;
  for (const [k, v] of Object.entries(AI_TOLLS)) {
    if (key.includes(k) || k.includes(from.toLowerCase()) || k.includes(to.toLowerCase())) {
      if (k.split(' ').some(w => from.toLowerCase().includes(w)) &&
          k.split(' ').some(w => to.toLowerCase().includes(w))) {
        return v;
      }
    }
  }
  return null;
}

async function buildNearbyPOI(lat, lng, amenity, title, type, limit = 4) {
  try {
    const radius = 15000; // 15km
    const query = `[out:json][timeout:10];node(around:${radius},${lat},${lng})[amenity=${amenity}];out ${limit};`;
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await r.json();
    if (!data.elements || data.elements.length === 0) {
      return `<div style="opacity:.6;font-size:11px">None found within 15 km</div>`;
    }
    const items = data.elements.slice(0, limit).map(el => {
      const name = el.tags?.name || el.tags?.brand || (type === 'petrol' ? 'Petrol Station' : 'EV Charger');
      const brand = el.tags?.brand || '';
      const dist = haversineKm({ lat, lng }, { lat: el.lat, lng: el.lon });
      const icon = type === 'petrol' ? '⛽' : '🔋';
      return `<div class="poi-item">${icon} <strong>${escapeHTML(name)}</strong>${brand && brand !== name ? ` <span style="opacity:.6">(${escapeHTML(brand)})</span>` : ''} <span class="poi-dist">${dist.toFixed(1)} km away</span></div>`;
    }).join('');
    return items;
  } catch(e) {
    return `<div style="opacity:.6;font-size:11px">Could not load nearby ${type} data</div>`;
  }
}

// Fetch POI nodes near a point, return raw objects for deduplication
async function fetchPOINodes(lat, lng, amenity, radiusM = 8000, limit = 6) {
  try {
    const q = `[out:json][timeout:12];node(around:${radiusM},${lat},${lng})[amenity=${amenity}];out ${limit};`;
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
    const data = await r.json();
    return (data.elements || []).map(el => ({
      id: el.id,
      lat: el.lat, lng: el.lon,
      name: el.tags?.name || el.tags?.brand || (amenity === 'fuel' ? 'Petrol Station' : 'EV Charger'),
      brand: el.tags?.brand || '',
      operator: el.tags?.operator || '',
      evSockets: el.tags?.['capacity:charging'] || el.tags?.['socket:type2'] || '',
    }));
  } catch(e) { return []; }
}

// Build deduplicated POI list from multiple route waypoints
async function buildRoutePOIHtml(waypoints, amenity, type, totalDistKm) {
  if (!waypoints || waypoints.length === 0) {
    return `<div style="opacity:.6;font-size:11px">No waypoints available</div>`;
  }

  // Query each waypoint in parallel with smaller radius for accuracy
  const segDistKm = totalDistKm / (waypoints.length - 1 || 1);
  const radius = Math.min(Math.max(segDistKm * 500, 5000), 12000); // 5–12km radius per segment

  const allNodes = await Promise.all(
    waypoints.map(wp => fetchPOINodes(wp.lat, wp.lng, amenity, radius, 4))
  );

  // Flatten & deduplicate by node id, then sort by distance from route start
  const seen = new Set();
  const deduped = allNodes.flat().filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  if (deduped.length === 0) {
    return `<div style="opacity:.6;font-size:11px">None found along route</div>`;
  }

  // Sort by proximity to first waypoint (start of route)
  const start = waypoints[0];
  deduped.sort((a, b) => haversineKm(start, a) - haversineKm(start, b));

  const icon = type === 'petrol' ? '⛽' : '🔋';
  return deduped.slice(0, 5).map(n => {
    // Approximate route position: nearest waypoint index → "~Xkm into route"
    let nearestWpIdx = 0;
    let minD = Infinity;
    waypoints.forEach((wp, i) => {
      const d = haversineKm(wp, n);
      if (d < minD) { minD = d; nearestWpIdx = i; }
    });
    const routePct = Math.round((nearestWpIdx / Math.max(waypoints.length - 1, 1)) * 100);
    const brandStr = n.brand && n.brand !== n.name ? ` <span class="poi-brand">(${escapeHTML(n.brand)})</span>` : '';
    const evStr = type === 'ev' && n.evSockets ? ` <span class="poi-badge">⚡${escapeHTML(n.evSockets)} socket</span>` : '';
    return `<div class="poi-item">
      ${icon} <strong>${escapeHTML(n.name)}</strong>${brandStr}${evStr}
      <span class="poi-dist">${minD.toFixed(1)} km off-route · ~${routePct}% into journey</span>
    </div>`;
  }).join('');
}

// ===== TRAFFIC TIME INTELLIGENCE =====

// Malaysian traffic congestion profile (0=free, 1=heaviest)
// Based on typical KL/Selangor weekday & weekend patterns
const TRAFFIC_PROFILE = {
  weekday: [
    0.15, 0.10, 0.08, 0.07, 0.10, 0.25, // 00-05
    0.55, 0.90, 0.95, 0.75, 0.55, 0.50, // 06-11
    0.60, 0.55, 0.50, 0.55, 0.75, 0.95, // 12-17
    0.92, 0.80, 0.65, 0.45, 0.30, 0.20, // 18-23
  ],
  weekend: [
    0.12, 0.08, 0.07, 0.06, 0.08, 0.12, // 00-05
    0.20, 0.30, 0.45, 0.55, 0.65, 0.70, // 06-11
    0.72, 0.68, 0.62, 0.58, 0.60, 0.65, // 12-17
    0.68, 0.60, 0.50, 0.38, 0.28, 0.18, // 18-23
  ],
};

const CONGESTION_LABEL = (v) =>
  v < 0.30 ? { label: 'Free Flow', cls: 'tl-free',  bar: Math.round(v * 100) } :
  v < 0.55 ? { label: 'Light',     cls: 'tl-light', bar: Math.round(v * 100) } :
  v < 0.72 ? { label: 'Moderate',  cls: 'tl-mod',   bar: Math.round(v * 100) } :
  v < 0.85 ? { label: 'Heavy',     cls: 'tl-heavy', bar: Math.round(v * 100) } :
             { label: 'Jam',       cls: 'tl-jam',   bar: Math.round(v * 100) };

function getTrafficProfile() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun, 6=Sat
  return (dow === 0 || dow === 6) ? TRAFFIC_PROFILE.weekend : TRAFFIC_PROFILE.weekday;
}

// Given base duration (minutes at free flow), estimate actual duration with congestion
function adjustedDuration(baseMin, congestionLevel) {
  // congestion 0 → 1x, 0.5 → 1.4x, 0.9 → 2.5x, 1.0 → 3.5x
  const mult = 1 + congestionLevel * 1.8 + Math.pow(congestionLevel, 2) * 0.5;
  return Math.round(baseMin * mult);
}

function formatMins(m) {
  const h = Math.floor(m / 60), min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}min` : `${min} min`;
}

// Build best-time recommendation card
function buildBestTimeHtml(baseMin, fromName, toName, forcedHour) {
  const profile = getTrafficProfile();
  const now = new Date();
  const currentHour = forcedHour !== undefined ? forcedHour : now.getHours();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const dayLabel = isWeekend ? 'Weekend' : 'Weekday';

  // Build 24 hour slots
  const slots = profile.map((cong, h) => ({
    hour: h,
    cong,
    duration: adjustedDuration(baseMin, cong),
    ...CONGESTION_LABEL(cong),
  }));

  // Best windows: top 4 lowest congestion hours
  const sorted = [...slots].sort((a, b) => a.cong - b.cong);
  const bestHours = sorted.slice(0, 4).map(s => s.hour).sort((a, b) => a - b);

  // Worst windows: top 3 highest congestion hours
  const worstHours = sorted.slice(-3).map(s => s.hour).sort((a, b) => a - b);

  // Best time now or next
  const nextBest = bestHours.find(h => h > currentHour) ?? bestHours[0];
  const nextBestSlot = slots[nextBest];
  const hoursUntil = nextBest > currentHour ? nextBest - currentHour : (24 - currentHour + nextBest);

  // Current slot
  const currSlot = slots[currentHour];

  // Build visual timeline (show all 24 hours in compact bars)
  const timelineRows = slots.map(s => {
    const isCurrent = s.hour === currentHour;
    const isBest = bestHours.includes(s.hour);
    const isWorst = worstHours.includes(s.hour);
    const ampm = s.hour === 0 ? '12am' : s.hour < 12 ? `${s.hour}am` : s.hour === 12 ? '12pm' : `${s.hour - 12}pm`;
    const marker = isCurrent ? '◀ Now' : isBest ? '✓ Best' : isWorst ? '✗ Avoid' : '';
    const markerCls = isCurrent ? 'tl-marker-now' : isBest ? 'tl-marker-best' : isWorst ? 'tl-marker-avoid' : '';
    return `<tr class="tl-row ${isCurrent ? 'tl-row-current' : ''} ${isBest ? 'tl-row-best' : ''} ${isWorst ? 'tl-row-avoid' : ''}">
      <td class="tl-hour">${ampm}</td>
      <td class="tl-bar-cell"><div class="tl-bar ${s.cls}" style="width:${s.bar}%"></div></td>
      <td class="tl-dur">${formatMins(s.duration)}</td>
      <td class="tl-tag"><span class="tl-marker ${markerCls}">${marker}</span></td>
    </tr>`;
  }).join('');

  // Best time summary message
  const saveMins = currSlot.duration - nextBestSlot.duration;
  const saveStr = saveMins > 0 ? `<span class="tl-save">Save ~${formatMins(saveMins)}</span>` : '';

  return `
    <div class="tl-header">
      🕐 Best Time to Travel
      <span class="tl-day-badge">${dayLabel}</span>
    </div>
    <div class="tl-route-label">${escapeHTML(fromName)} → ${escapeHTML(toName)}</div>

    <div class="tl-recommendation">
      <div class="tl-rec-now">
        <span class="tl-rec-label">Now (${currentHour}:00)</span>
        <span class="tl-rec-dur ${currSlot.cls}-text">${formatMins(currSlot.duration)}</span>
        <span class="tl-rec-cong ${currSlot.cls}-text">${currSlot.label}</span>
      </div>
      <div class="tl-rec-best">
        <span class="tl-rec-label">Best window</span>
        <span class="tl-rec-dur tl-free-text">${formatMins(nextBestSlot.duration)} @ ${nextBest}:00</span>
        <span class="tl-rec-cong">${hoursUntil === 0 ? 'Right now!' : `in ${hoursUntil}h`} ${saveStr}</span>
      </div>
    </div>

    <div class="tl-scroll-hint">Scroll → full day forecast</div>
    <div class="tl-table-wrap">
      <table class="tl-table">${timelineRows}</table>
    </div>

    <div class="tl-tip">💡 <strong>Best times today:</strong>
      ${bestHours.map(h => { const ampm = h < 12 ? `${h||12}am` : h === 12 ? '12pm' : `${h-12}pm`; return `<span class="tl-best-chip">${ampm}</span>`; }).join(' ')}
    </div>
    <div class="tl-tip tl-avoid-tip">⚠️ <strong>Avoid:</strong>
      ${worstHours.map(h => { const ampm = h < 12 ? `${h||12}am` : h === 12 ? '12pm' : `${h-12}pm`; return `<span class="tl-avoid-chip">${ampm}</span>`; }).join(' ')}
    </div>
  `;
}

function buildSOSResponse() {
  const rows = Object.entries(AI_SOS).map(([name, num]) =>
    `<tr><td>${escapeHTML(name)}</td><td><a href="tel:${num.replace(/-/g,'')}" class="sos-link">${escapeHTML(num)}</a></td></tr>`
  ).join('');
  return `
    <div class="sos-header">🆘 Malaysian Emergency & Road Assistance Numbers</div>
    <table class="sos-table">${rows}</table>
    <div style="margin-top:8px;font-size:11px;opacity:.7">Tap a number to call directly from your device.</div>
  `;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }


// ===== MOBILE UI =====

const MOBILE_BP = 768; // px

function isMobile() { return window.innerWidth <= MOBILE_BP; }

// Sheet states cycle: peek → half → full → peek
const SHEET_STATES = ['sheet-peek', 'sheet-half', 'sheet-full'];
let sheetStateIdx = 0; // start at peek (just tab bar visible)

function setupMobileUI() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('mobileOverlay');
  const menuBtn   = document.getElementById('mobileMenuBtn');
  const panel     = document.getElementById('osintPanel');
  const handle    = document.getElementById('mobileSheetHandle');

  if (!sidebar || !overlay) return;

  // ---- Hamburger menu toggle ----
  if (menuBtn) {
    menuBtn.addEventListener('click', () => openMobileSidebar());
  }

  // ---- Overlay tap → close sidebar ----
  overlay.addEventListener('click', () => closeMobileSidebar());

  // ---- Swipe left on sidebar to close ----
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -50) closeMobileSidebar();
  }, { passive: true });

  // ---- Swipe right from left edge → open sidebar ----
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (touchStartX < 24 && dx > 60 && isMobile()) openMobileSidebar();
  }, { passive: true });

  // ---- Bottom sheet: tap panel tabs area to cycle states ----
  if (panel) {
    applySheetState(panel, sheetStateIdx);
    // Tap on the tab bar → cycle sheet state
    const tabBar = panel.querySelector('.panel-tabs');
    if (tabBar) {
      tabBar.addEventListener('click', e => {
        if (!isMobile()) return;
        // If clicking a tab button, let it switch tab normally; also open sheet
        if (e.target.closest('.panel-tab') || e.target.closest('[data-tab]')) {
          // if peeked, open to half
          if (sheetStateIdx === 0) { sheetStateIdx = 1; applySheetState(panel, sheetStateIdx); }
          return;
        }
        // Collapse button → toggle peek
        if (e.target.closest('#panelCollapse')) {
          sheetStateIdx = sheetStateIdx === 0 ? 1 : 0;
          applySheetState(panel, sheetStateIdx);
          return;
        }
        // Tapping empty area → cycle
        sheetStateIdx = (sheetStateIdx + 1) % SHEET_STATES.length;
        applySheetState(panel, sheetStateIdx);
      });
    }

    // Drag handle cycles sheet
    if (handle) {
      const handleBar = handle.querySelector('.handle-bar');
      if (handleBar) {
        handleBar.addEventListener('click', () => {
          if (!isMobile()) return;
          sheetStateIdx = (sheetStateIdx + 1) % SHEET_STATES.length;
          applySheetState(panel, sheetStateIdx);
        });

        // Drag handle: touch drag to resize sheet
        let dragStartY = 0;
        let dragStartState = 0;
        handleBar.addEventListener('touchstart', e => {
          dragStartY = e.touches[0].clientY;
          dragStartState = sheetStateIdx;
          e.stopPropagation();
        }, { passive: true });
        handleBar.addEventListener('touchend', e => {
          const dy = e.changedTouches[0].clientY - dragStartY;
          if (dy > 40) {
            // dragged down → collapse
            sheetStateIdx = Math.max(0, sheetStateIdx - 1);
          } else if (dy < -40) {
            // dragged up → expand
            sheetStateIdx = Math.min(SHEET_STATES.length - 1, sheetStateIdx + 1);
          }
          applySheetState(panel, sheetStateIdx);
          e.stopPropagation();
        }, { passive: true });
      }
    }
  }

  // ---- Resize: reset sidebar state on desktop ----
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
    } else {
      // Reapply sheet state
      if (panel) applySheetState(panel, sheetStateIdx);
    }
  });

  // ---- Sync mobile KPI strip with main KPI values ----
  syncMobileKPI();
  // Re-sync whenever KPI values change (observe DOM)
  observeKPIUpdates();

  // ---- Fix 100vh on iOS (address bar issue) ----
  fixMobileViewport();
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.add('mobile-open');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  lucide.createIcons(); // re-render any new icons
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

function applySheetState(panel, idx) {
  SHEET_STATES.forEach(s => panel.classList.remove(s));
  panel.classList.add(SHEET_STATES[idx]);

  // Position drag handle above the panel
  const handle = document.getElementById('mobileSheetHandle');
  if (handle && isMobile()) {
    const panelRect = panel.getBoundingClientRect();
    const topOfPanel = window.innerHeight - panel.offsetHeight + (idx === 0 ? panel.offsetHeight - 48 : 0);
    handle.style.bottom = (window.innerHeight - Math.max(panelRect.top, 0)) + 'px';
  }
}

function syncMobileKPI() {
  const map = {
    mkpiCongestion: 'kpiCongestion',
    mkpiIncidents: 'kpiIncidents',
    mkpiRoads: 'kpiRoads',
    mkpiAvgSpeed: 'kpiAvgSpeed',
  };
  Object.entries(map).forEach(([mobileId, desktopId]) => {
    const src = document.getElementById(desktopId);
    const dst = document.getElementById(mobileId);
    if (src && dst) dst.textContent = src.textContent;
  });
}

function observeKPIUpdates() {
  const ids = ['kpiCongestion', 'kpiIncidents', 'kpiRoads', 'kpiAvgSpeed'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const obs = new MutationObserver(() => syncMobileKPI());
    obs.observe(el, { childList: true, subtree: true, characterData: true });
  });
}

function fixMobileViewport() {
  // Fix iOS 100vh bug — sets --real-vh CSS variable
  const setVH = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--real-vh', `${vh}px`);
  };
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 150));
}

