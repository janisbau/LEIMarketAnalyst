'use strict';

// ===================================================
// api.js — GLEIF data fetching, caching, normalization
// ===================================================

window.App = window.App || {};
App.api = {};
App.data = {
  lous: [],
  ras: [],
  louMap: {},
  rasByLou: {},
  jurisdictions: {},
  countryCoverage: {},
  louHomeCountries: {},
  stats: null,
  history: [],
  marketShare: null,
  marketShareHistory: [],
  renewalPipeline: null,
  entityTypes: null,
  regulatoryContext: {},
};

const GLEIF_BASE = 'https://api.gleif.org/api/v1';

// ---- Core fetch with sessionStorage cache ----

function cachedFetch(url) {
  const key = 'gleif_' + url;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return Promise.resolve(JSON.parse(cached));
  } catch (e) {}

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
      if (res.status === 429) { await sleep(1000 * (i + 1)); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(500);
    }
  }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

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
    if (pageNum > 20) break;
  }
  return results;
}

// ---- Safe local JSON fetch (no error if file missing/placeholder) ----
async function loadLocalJson(path, fallback) {
  try {
    var res = await fetch(path);
    if (!res.ok) return fallback;
    var json = await res.json();
    // If it's a placeholder with _note and null date, treat as empty
    if (json && json._note && json.date === null) return fallback;
    return json;
  } catch (e) { return fallback; }
}

// ---- Public API ----

App.api.loadAllLOUs = function() { return fetchAllPages('/lei-issuers'); };
App.api.loadAllRAs  = function() { return fetchAllPages('/registration-agents'); };

App.api.loadJurisdictions = function(louLei) {
  var url = GLEIF_BASE + '/lei-issuers/' + louLei + '/jurisdictions?page[size]=300';
  return cachedFetch(url).then(function(data) { return data.data || []; }).catch(function() { return []; });
};

App.api.loadLocalStats = async function() {
  // Load all static/pipeline-generated files in parallel
  var results = await Promise.all([
    loadLocalJson('data/daily-stats.json', null),
    loadLocalJson('data/history.json', []),
    loadLocalJson('data/market-share.json', null),
    loadLocalJson('data/market-share-history.json', []),
    loadLocalJson('data/renewal-pipeline.json', null),
    loadLocalJson('data/entity-types.json', null),
    loadLocalJson('data/regulatory-context.json', {}),
    loadLocalJson('data/lou-home-countries.json', {}),
  ]);

  App.data.stats              = results[0];
  App.data.history            = results[1];
  App.data.marketShare        = results[2];
  App.data.marketShareHistory = results[3];
  App.data.renewalPipeline    = results[4];
  App.data.entityTypes        = results[5];
  App.data.regulatoryContext  = results[6];
  App.data.louHomeCountries   = results[7];
};

// ---- Main boot orchestrator ----

App.api.loadAllData = async function(onProgress) {
  function progress(msg) { if (onProgress) onProgress(msg); }

  progress('Loading LOU and RA data...');
  var [lous, ras] = await Promise.all([
    App.api.loadAllLOUs(),
    App.api.loadAllRAs(),
    App.api.loadLocalStats(),
  ]);

  App.data.lous = lous;
  App.data.ras  = ras;

  // Build lookup maps
  App.data.louMap = {};
  lous.forEach(function(lou) { App.data.louMap[lou.id] = lou; });

  App.data.rasByLou = {};
  ras.forEach(function(ra) {
    var louLei = (ra.relationships &&
                  ra.relationships['lei-issuer'] &&
                  ra.relationships['lei-issuer'].data &&
                  ra.relationships['lei-issuer'].data.id) ||
                 (ra.attributes && ra.attributes.leiIssuer) || null;
    ra._louLei = louLei;
    if (louLei) {
      if (!App.data.rasByLou[louLei]) App.data.rasByLou[louLei] = [];
      App.data.rasByLou[louLei].push(ra);
    }
  });

  // Fetch all jurisdiction lists in parallel
  progress('Loading jurisdiction data...');
  var louLeis = lous.map(function(l) { return l.id; });
  var jurisdictionResults = await Promise.all(
    louLeis.map(function(lei) { return App.api.loadJurisdictions(lei); })
  );

  App.data.jurisdictions   = {};
  App.data.countryCoverage = {};
  louLeis.forEach(function(lei, i) {
    App.data.jurisdictions[lei] = jurisdictionResults[i];
    jurisdictionResults[i].forEach(function(j) {
      var cc = j.attributes && j.attributes.countryCode;
      if (!cc) return;
      if (!App.data.countryCoverage[cc]) App.data.countryCoverage[cc] = [];
      if (!App.data.countryCoverage[cc].includes(lei)) App.data.countryCoverage[cc].push(lei);
    });
  });

  // If louHomeCountries is empty (full pipeline not run), derive proxy from jurisdictions
  if (Object.keys(App.data.louHomeCountries).length === 0) {
    louLeis.forEach(function(lei) {
      var jurs = App.data.jurisdictions[lei] || [];
      if (jurs.length > 0) {
        // Use first jurisdiction as proxy home country
        var cc = jurs[0].attributes && jurs[0].attributes.countryCode;
        if (cc) App.data.louHomeCountries[lei] = cc;
      }
    });
  }

  progress('Ready');
};
