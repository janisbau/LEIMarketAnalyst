'use strict';

// ===================================================
// api.js — GLEIF data fetching, caching, normalization
// ===================================================

window.App = window.App || {};
App.api = {};
App.data = {
  lous: [],
  ras: [],
  louMap: {},          // { louLei: louObject }
  rasByLou: {},        // { louLei: [ra, ...] }
  jurisdictions: {},   // { louLei: [jurisdiction, ...] }
  countryCoverage: {}, // { 'US': [louLei, ...] }
  stats: null,         // parsed data/daily-stats.json
  history: [],         // parsed data/history.json
};

const GLEIF_BASE = 'https://api.gleif.org/api/v1';

// ---- Core fetch with sessionStorage cache ----

function cachedFetch(url) {
  const key = 'gleif_' + url;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return Promise.resolve(JSON.parse(cached));
  } catch (e) { /* sessionStorage full or unavailable — skip cache */ }

  return fetchWithRetry(url).then(function(json) {
    try { sessionStorage.setItem(key, JSON.stringify(json)); } catch (e) {}
    return json;
  });
}

async function fetchWithRetry(url, retries) {
  retries = retries || 3;
  for (var i = 0; i < retries; i++) {
    try {
      var res = await fetch(url);
      if (res.status === 429) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(500);
    }
  }
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// Fetch all pages of a GLEIF paginated resource
// IMPORTANT: use template literals for bracket-notation params — URLSearchParams encodes [ as %5B
async function fetchAllPages(path) {
  var results = [];
  var pageNum = 1;
  var hasNext = true;

  while (hasNext) {
    var url = GLEIF_BASE + path + '?page[size]=100&page[number]=' + pageNum;
    var data = await cachedFetch(url);
    results = results.concat(data.data || []);
    hasNext = !!(data.links && data.links.next);
    pageNum++;
    if (pageNum > 20) break; // safety limit
  }
  return results;
}

// ---- Public API methods ----

App.api.loadAllLOUs = function() {
  return fetchAllPages('/lei-issuers');
};

App.api.loadAllRAs = function() {
  return fetchAllPages('/registration-agents');
};

App.api.loadJurisdictions = function(louLei) {
  var url = GLEIF_BASE + '/lei-issuers/' + louLei + '/jurisdictions?page[size]=300';
  return cachedFetch(url).then(function(data) {
    return data.data || [];
  }).catch(function() { return []; });
};

App.api.loadLocalStats = async function() {
  // Load pre-computed stats from GitHub Actions pipeline
  // Falls back to empty data if file doesn't exist yet
  try {
    var statsRes = await fetch('data/daily-stats.json');
    if (statsRes.ok) App.data.stats = await statsRes.json();
  } catch (e) { App.data.stats = null; }

  try {
    var historyRes = await fetch('data/history.json');
    if (historyRes.ok) App.data.history = await historyRes.json();
  } catch (e) { App.data.history = []; }
};

// ---- Main boot orchestrator ----

App.api.loadAllData = async function(onProgress) {
  function progress(msg) {
    if (onProgress) onProgress(msg);
  }

  progress('Loading LOU and RA data...');
  var [lous, ras] = await Promise.all([
    App.api.loadAllLOUs(),
    App.api.loadAllRAs(),
    App.api.loadLocalStats(),
  ]);

  App.data.lous = lous;
  App.data.ras = ras;

  // Build O(1) lookup maps
  App.data.louMap = {};
  lous.forEach(function(lou) {
    App.data.louMap[lou.id] = lou;
  });

  App.data.rasByLou = {};
  ras.forEach(function(ra) {
    var louLei = ra.relationships &&
                 ra.relationships['lei-issuer'] &&
                 ra.relationships['lei-issuer'].data &&
                 ra.relationships['lei-issuer'].data.id;
    if (!louLei) {
      // fallback: check attributes
      louLei = ra.attributes && ra.attributes.leiIssuer;
    }
    ra._louLei = louLei || null;
    if (louLei) {
      if (!App.data.rasByLou[louLei]) App.data.rasByLou[louLei] = [];
      App.data.rasByLou[louLei].push(ra);
    }
  });

  // Fetch all jurisdiction lists in parallel
  progress('Loading jurisdiction data for all LOUs...');
  var louLeis = lous.map(function(l) { return l.id; });
  var jurisdictionResults = await Promise.all(
    louLeis.map(function(lei) { return App.api.loadJurisdictions(lei); })
  );

  App.data.jurisdictions = {};
  App.data.countryCoverage = {};
  louLeis.forEach(function(lei, i) {
    App.data.jurisdictions[lei] = jurisdictionResults[i];
    jurisdictionResults[i].forEach(function(j) {
      var cc = j.attributes && j.attributes.countryCode;
      if (!cc) return;
      if (!App.data.countryCoverage[cc]) App.data.countryCoverage[cc] = [];
      if (!App.data.countryCoverage[cc].includes(lei)) {
        App.data.countryCoverage[cc].push(lei);
      }
    });
  });

  progress('Ready');
};
