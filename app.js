'use strict';

// ===================================================
// app.js — Entry point: boot sequence, view switching
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

  // Lazy init: only render a view the first time it's shown
  if (!_initializedViews[name]) {
    _initializedViews[name] = true;
    switch (name) {
      case 'dashboard': App.views.initDashboard && App.views.initDashboard(); break;
      case 'map':       App.views.initMap       && App.views.initMap();       break;
      case 'network':   App.views.initNetwork   && App.views.initNetwork();   break;
      case 'lous':      App.views.initLouTable  && App.views.initLouTable();  break;
      case 'ras':       App.views.initRaTable   && App.views.initRaTable();   break;
      case 'trends':    App.views.initTrends    && App.views.initTrends();    break;
    }
  }
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
  banner.textContent = '⚠ ' + msg;
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

  // Update "data as of" indicator
  var freshEl = document.getElementById('data-freshness');
  if (freshEl) {
    var label = App.data.stats && App.data.stats.date
      ? 'Data as of ' + App.data.stats.date
      : 'Live data';
    freshEl.textContent = label;
  }

  hideLoadingOverlay();

  // Show dashboard by default
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
