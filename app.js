'use strict';

// ===================================================
// app.js — Entry point: boot sequence, view switching, global search
// ===================================================

window.App = window.App || {};
App.views = App.views || {};

var _initializedViews = {};

// ---- View switching ----

function showView(name) {
  document.querySelectorAll('.view-section').forEach(function(s) {
    s.classList.remove('active');
  });
  var section = document.getElementById('view-' + name);
  if (section) section.classList.add('active');

  document.querySelectorAll('.nav-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.view === name);
  });

  if (!_initializedViews[name]) {
    _initializedViews[name] = true;
    switch (name) {
      case 'dashboard':    App.views.initDashboard    && App.views.initDashboard();    break;
      case 'map':          App.views.initMap          && App.views.initMap();          break;
      case 'network':      App.views.initNetwork      && App.views.initNetwork();      break;
      case 'lous':         App.views.initLouTable     && App.views.initLouTable();     break;
      case 'ras':          App.views.initRaTable      && App.views.initRaTable();      break;
      case 'trends':       App.views.initTrends       && App.views.initTrends();       break;
      case 'intelligence': App.views.initIntelligence && App.views.initIntelligence(); break;
    }
  }
}

// Make showView accessible globally so inline onclick handlers work
window.showView = showView;

// ---- Global search ----

function initGlobalSearch() {
  var input = document.getElementById('global-search');
  var dropdown = document.getElementById('search-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', function() {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }
    var results = [];

    // Search LOUs
    (App.data.lous || []).forEach(function(lou) {
      var name = (lou.attributes && lou.attributes.name) || '';
      var lei = lou.id || '';
      if (name.toLowerCase().indexOf(q) !== -1 || lei.toLowerCase().indexOf(q) !== -1) {
        results.push({ type: 'lou', label: name, sub: lei, lei: lei });
      }
    });

    // Search RAs (by company name)
    var seenRAs = {};
    (App.data.ras || []).forEach(function(ra) {
      var name = (ra.attributes && ra.attributes.name) || '';
      if (seenRAs[name]) return;
      if (name.toLowerCase().indexOf(q) !== -1) {
        seenRAs[name] = true;
        results.push({ type: 'ra', label: name, sub: 'Registration Agent' });
      }
    });

    // Search countries
    var seenCC = {};
    Object.keys(App.data.countryCoverage || {}).forEach(function(cc) {
      if (seenCC[cc]) return;
      if (cc.toLowerCase().indexOf(q) !== -1) {
        seenCC[cc] = true;
        var louCount = (App.data.countryCoverage[cc] || []).length;
        results.push({ type: 'country', label: cc, sub: louCount + ' LOU' + (louCount !== 1 ? 's' : '') });
      }
    });

    results = results.slice(0, 8);

    if (results.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.innerHTML = results.map(function(r) {
      var typeClass = r.type;
      return '<div class="search-result" data-type="' + r.type + '" data-lei="' + (r.lei || '') + '" data-cc="' + (r.cc || r.label) + '" data-name="' + r.label + '">' +
        '<span class="search-result-type ' + typeClass + '">' + r.type + '</span>' +
        '<span class="search-result-label">' + r.label + '</span>' +
        '<span class="search-result-sub">' + r.sub + '</span>' +
        '</div>';
    }).join('');

    dropdown.classList.remove('hidden');
  });

  dropdown.addEventListener('click', function(e) {
    var item = e.target.closest('.search-result');
    if (!item) return;
    var type = item.getAttribute('data-type');
    var lei = item.getAttribute('data-lei');
    var name = item.getAttribute('data-name');

    input.value = '';
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';

    if (type === 'lou' && lei) {
      if (App.views.showLouProfile) App.views.showLouProfile(lei);
    } else if (type === 'ra') {
      showView('ras');
      // Try to filter RA table
      setTimeout(function() {
        var filterInput = document.querySelector('#ra-table .tabulator-header-filter input');
        if (filterInput) { filterInput.value = name; filterInput.dispatchEvent(new Event('input')); }
      }, 300);
    } else if (type === 'country') {
      showView('map');
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

// ---- Loading overlay helpers ----

function setLoadingMessage(msg) {
  var el = document.getElementById('loading-message');
  if (el) el.textContent = msg;
}

function hideLoadingOverlay() {
  var overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.add('fade-out');
  setTimeout(function() { overlay.style.display = 'none'; }, 450);
}

function showError(msg) {
  hideLoadingOverlay();
  var content = document.getElementById('main-content');
  var banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = '\u26a0 ' + msg;
  content.prepend(banner);
}

// ---- Boot sequence ----

async function initApp() {
  try {
    await App.api.loadAllData(setLoadingMessage);
  } catch (e) {
    showError('Failed to load GLEIF data. Check your internet connection and reload. (' + e.message + ')');
    return;
  }

  var freshEl = document.getElementById('data-freshness');
  if (freshEl) {
    var label = App.data.stats && App.data.stats.date
      ? 'Data as of ' + App.data.stats.date
      : 'Live data';
    freshEl.textContent = label;
  }

  hideLoadingOverlay();
  initGlobalSearch();
  showView('dashboard');
}

// ---- Nav tab event listeners ----

document.querySelectorAll('.nav-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    showView(tab.dataset.view);
  });
});

// ---- Start ----

initApp();
