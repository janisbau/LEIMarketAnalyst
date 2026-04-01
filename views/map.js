'use strict';

window.App = window.App || {};
App.views = App.views || {};

var _mapInstance = null;
var _geoJsonLayer = null;
var _mapMode = 'coverage'; // 'coverage' | 'opportunity'
var _opportunityScores = null; // cached scores keyed by cc

App.views.initMap = async function() {
  var container = document.getElementById('world-map');
  if (!container) return;

  if (_mapInstance) { _mapInstance.remove(); _mapInstance = null; }

  _mapInstance = L.map('world-map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 6,
    zoomControl: true,
    scrollWheelZoom: true,
    dragging: true,
    worldCopyJump: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_mapInstance);

  // Pre-compute opportunity scores
  _opportunityScores = computeMapOpportunityScores();

  var geoJson = await loadGeoJson();
  if (!geoJson) {
    container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center">Failed to load map data.</p>';
    return;
  }

  _geoJsonLayer = L.geoJSON(geoJson, {
    style: styleFeature,
    onEachFeature: onEachFeature,
  }).addTo(_mapInstance);

  // Wire mode toggle buttons
  document.querySelectorAll('.map-mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _mapMode = btn.getAttribute('data-mode') || 'coverage';
      document.querySelectorAll('.map-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (_geoJsonLayer) _geoJsonLayer.setStyle(styleFeature);
    });
  });
};

function computeMapOpportunityScores() {
  var scores = {};
  var countryCoverage = App.data.countryCoverage || {};
  var history = App.data.history || [];

  var vol30 = {}, volPrev = {};
  history.slice(-30).forEach(function(d) {
    if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
      vol30[cc] = (vol30[cc] || 0) + (d.byCountry[cc] || 0);
    });
  });
  history.slice(-60, -30).forEach(function(d) {
    if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
      volPrev[cc] = (volPrev[cc] || 0) + (d.byCountry[cc] || 0);
    });
  });

  var allCCs = new Set(Object.keys(countryCoverage).concat(Object.keys(vol30)));
  allCCs.forEach(function(cc) {
    var louCount = (countryCoverage[cc] || []).length;
    var v30 = vol30[cc] || 0;
    var vPrev = volPrev[cc] || 0;
    var coverageScore = louCount === 0 ? 40 : louCount === 1 ? 30 : louCount === 2 ? 15 : 0;
    var growthRate = vPrev > 0 ? (v30 - vPrev) / vPrev : 0;
    var growthScore = Math.min(40, Math.max(0, growthRate * 200));
    var hhiScore = louCount === 1 ? 20 : louCount >= 2 ? 10 : 0;
    scores[cc] = Math.round(Math.min(100, coverageScore + growthScore + hhiScore));
  });
  return scores;
}

function styleFeature(feature) {
  var cc = getCountryCode(feature);

  if (_mapMode === 'opportunity') {
    var score = cc && _opportunityScores ? (_opportunityScores[cc] || 0) : 0;
    var fillColor = score >= 60 ? '#00e676'
      : score >= 40 ? '#ffd600'
      : score >= 20 ? '#ff9800'
      : '#1e2a3a';
    return { fillColor: fillColor, fillOpacity: score > 0 ? 0.75 : 0.3, color: '#1e2a3a', weight: 0.8 };
  }

  // Coverage mode (default)
  var louCount = cc ? (App.data.countryCoverage[cc] || []).length : 0;
  var fillColor = louCount === 0 ? '#111827'
    : louCount === 1 ? '#0d47a1'
    : louCount === 2 ? '#1976d2'
    : '#00d4ff';
  return { fillColor: fillColor, fillOpacity: louCount === 0 ? 0.5 : 0.75, color: '#1e2a3a', weight: 0.8 };
}

function onEachFeature(feature, layer) {
  var cc = getCountryCode(feature);
  var countryName = (feature.properties && (feature.properties.ADMIN || feature.properties.name)) || cc || 'Unknown';
  var lous = cc ? (App.data.countryCoverage[cc] || []) : [];

  layer.on({
    mouseover: function(e) {
      e.target.setStyle({ weight: 2, color: '#00d4ff', fillOpacity: 0.9 });
      e.target.bringToFront();
    },
    mouseout: function(e) {
      _geoJsonLayer.resetStyle(e.target);
    },
    click: function(e) {
      var html = '<div class="popup-country">' + countryName + '</div>';

      // Opportunity score
      var score = cc && _opportunityScores ? (_opportunityScores[cc] || 0) : 0;
      var scoreBadge = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
      if (score > 0) {
        html += '<div style="margin-bottom:6px"><span class="score-badge ' + scoreBadge + '" style="font-size:11px">Opportunity: ' + score + '/100</span></div>';
      }

      if (lous.length === 0) {
        html += '<div style="color:var(--text-secondary);font-size:12px">No LOUs accredited here</div>';
      } else {
        lous.forEach(function(louLei) {
          var lou = App.data.louMap[louLei];
          var name = lou ? (App.helpers ? App.helpers.louName(lou) : louLei) : louLei;
          var delta = App.data.stats && App.data.stats.byLou && App.data.stats.byLou[louLei];
          html += '<div class="popup-lou" style="cursor:pointer" onclick="App.views.showLouProfile(\'' + louLei + '\')">' + name;
          if (delta) html += '<span class="popup-delta">+' + delta.toLocaleString() + ' today</span>';
          html += '</div>';
        });
      }

      L.popup({ maxWidth: 300 })
        .setLatLng(e.latlng)
        .setContent(html)
        .openOn(_mapInstance);
    },
  });
}

function getCountryCode(feature) {
  if (!feature || !feature.properties) return null;
  return feature.properties.ISO_A2 ||
         feature.properties.iso_a2 ||
         feature.properties.ISO2 ||
         feature.properties.iso2 ||
         feature.properties.ADM0_A3 ||
         null;
}

async function loadGeoJson() {
  var GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
  var cacheKey = 'gleif_geojson_countries';
  try {
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  try {
    var res = await fetch(GEOJSON_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch (e) {}
    return json;
  } catch (e) {
    console.error('Failed to load GeoJSON:', e);
    return null;
  }
}
