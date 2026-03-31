'use strict';

window.App = window.App || {};
App.views = App.views || {};

var _mapInstance = null;
var _geoJsonLayer = null;

App.views.initMap = async function() {
  var container = document.getElementById('world-map');
  if (!container) return;

  // Init Leaflet map
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

  // Dark base tile layer (CartoDB dark matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_mapInstance);

  // Load GeoJSON country polygons
  var geoJson = await loadGeoJson();
  if (!geoJson) {
    container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center">Failed to load map data.</p>';
    return;
  }

  _geoJsonLayer = L.geoJSON(geoJson, {
    style: styleFeature,
    onEachFeature: onEachFeature,
  }).addTo(_mapInstance);
};

function styleFeature(feature) {
  var cc = getCountryCode(feature);
  var louCount = cc ? (App.data.countryCoverage[cc] || []).length : 0;

  var fillColor = louCount === 0 ? '#111827'
    : louCount === 1 ? '#0d47a1'
    : louCount === 2 ? '#1976d2'
    : '#00d4ff';

  var fillOpacity = louCount === 0 ? 0.5 : 0.75;

  return {
    fillColor: fillColor,
    fillOpacity: fillOpacity,
    color: '#1e2a3a',
    weight: 0.8,
  };
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

      if (lous.length === 0) {
        html += '<div style="color:var(--text-secondary);font-size:12px">No LOUs accredited here</div>';
      } else {
        lous.forEach(function(louLei) {
          var lou = App.data.louMap[louLei];
          var name = lou ? (App.helpers ? App.helpers.louName(lou) : louLei) : louLei;
          var delta = App.data.stats && App.data.stats.byLou && App.data.stats.byLou[louLei];
          html += '<div class="popup-lou">' + name;
          if (delta) html += '<span class="popup-delta">+' + delta.toLocaleString() + ' today</span>';
          html += '</div>';
        });
      }

      L.popup({ maxWidth: 280 })
        .setLatLng(e.latlng)
        .setContent(html)
        .openOn(_mapInstance);
    },
  });
}

function getCountryCode(feature) {
  if (!feature || !feature.properties) return null;
  // GeoJSON datasets use different property names
  return feature.properties.ISO_A2 ||
         feature.properties.iso_a2 ||
         feature.properties.ISO2 ||
         feature.properties.iso2 ||
         feature.properties.ADM0_A3 || // fallback 3-letter
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
