'use strict';

// ===================================================
// views/lou-profile.js — Full-screen LOU profile overlay
// Implements: REQ-10
// ===================================================

App.views = App.views || {};

var _profileChart = null;
var _profileShareChart = null;

function pEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pLouName(lei) {
  var lou = App.data.louMap && App.data.louMap[lei];
  return lou ? (lou.attributes && lou.attributes.name) || lei : lei;
}

// ---- Tab renderers ----

function renderProfileOverview(lou, louLei) {
  var attr = lou.attributes || {};
  var ms = App.data.marketShare && App.data.marketShare.byLou && App.data.marketShare.byLou[louLei];
  var rasList = App.data.rasByLou[louLei] || [];
  var jurs = App.data.jurisdictions[louLei] || [];
  var history = App.data.history || [];

  // KPIs
  var active = ms ? ms.active : '\u2014';
  var lapsed = ms ? ms.lapsed : '\u2014';
  var total = ms ? ms.total : '\u2014';
  var share = ms ? (ms.share * 100).toFixed(2) + '%' : '\u2014';
  var lapseRate = ms && ms.total > 0 ? (ms.lapsed / ms.total * 100).toFixed(1) + '%' : '\u2014';
  var raCount = rasList.length;
  var countryCount = jurs.length;

  // LOU registration date → age
  var regDate = attr.registration && attr.registration.initialRegistrationDate;
  var ageStr = '\u2014';
  if (regDate) {
    var years = ((Date.now() - new Date(regDate)) / (365.25 * 24 * 3600 * 1000)).toFixed(1);
    ageStr = years + ' yrs';
  }

  var html = '<div class="profile-kpi-grid">';
  html += kpiCard('Active LEIs', typeof active === 'number' ? active.toLocaleString() : active, '');
  html += kpiCard('Lapsed LEIs', typeof lapsed === 'number' ? lapsed.toLocaleString() : lapsed, '');
  html += kpiCard('Market Share', share, '');
  html += kpiCard('Lapse Rate', lapseRate, lapseRate !== '\u2014' && parseFloat(lapseRate) > 20 ? 'warn' : '');
  html += kpiCard('RAs', raCount, '');
  html += kpiCard('Countries', countryCount, '');
  html += kpiCard('LOU Age', ageStr, '');
  html += '</div>';

  // Status from latest history
  var latest = history.length > 0 ? history[history.length - 1] : null;
  var byLouStatus = latest && latest.byLouStatus && latest.byLouStatus[louLei];
  if (byLouStatus) {
    var statuses = Object.keys(byLouStatus);
    var tot = statuses.reduce(function(s, k) { return s + byLouStatus[k]; }, 0);
    if (tot > 0) {
      html += '<div style="margin:20px 0 8px;font-size:13px;color:var(--text-muted)">Status breakdown (today)</div>';
      html += '<div class="status-bar">';
      statuses.forEach(function(st) {
        var pct = (byLouStatus[st] / tot * 100).toFixed(1);
        var color = st === 'ISSUED' ? 'var(--accent-green)' : st === 'LAPSED' ? 'var(--accent-red)' : '#888';
        html += '<div class="status-seg" style="width:' + pct + '%;background:' + color + '" title="' + pEsc(st) + ': ' + byLouStatus[st].toLocaleString() + '"></div>';
      });
      html += '</div>';
      html += '<div style="display:flex;gap:16px;margin-top:6px;font-size:12px;">';
      statuses.forEach(function(st) {
        html += '<span style="color:var(--text-muted)">' + pEsc(st) + ': ' + (byLouStatus[st] || 0).toLocaleString() + '</span>';
      });
      html += '</div>';
    }
  }

  // Transfer flows
  if (latest && latest.transfers) {
    var outflow = (latest.transfers.outflows && latest.transfers.outflows[louLei]) || 0;
    if (outflow > 0) {
      html += '<div class="profile-insight warn">\u26a0 ' + outflow + ' outbound transfer(s) today \u2014 possible client migration signal.</div>';
    }
  }

  // Renewal pipeline next 3 months
  var pipeline = App.data.renewalPipeline && App.data.renewalPipeline.byLou && App.data.renewalPipeline.byLou[louLei];
  if (pipeline) {
    var months = Object.keys(pipeline).sort().slice(0, 6);
    if (months.length > 0) {
      html += '<div style="margin-top:20px"><div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Upcoming renewals</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      months.forEach(function(m) {
        html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;padding:6px 12px;font-size:12px"><div style="color:var(--text-muted)">' + pEsc(m) + '</div><div style="font-weight:600">' + (pipeline[m] || 0).toLocaleString() + '</div></div>';
      });
      html += '</div></div>';
    }
  }

  return html;
}

function kpiCard(label, value, mod) {
  var style = mod === 'warn' ? 'border-color:var(--accent-red)' : '';
  return '<div class="profile-kpi" style="' + style + '"><div class="kpi-value">' + pEsc(String(value)) + '</div><div class="kpi-label">' + pEsc(label) + '</div></div>';
}

function renderProfileRAs(louLei) {
  var rasList = App.data.rasByLou[louLei] || [];
  if (rasList.length === 0) {
    return '<p style="color:var(--text-muted);padding:20px">No Registration Agents linked to this LOU.</p>';
  }

  // Compute loyalty for each RA name
  var raLouCount = {};
  (App.data.ras || []).forEach(function(ra) {
    var name = ra.attributes && ra.attributes.name;
    if (!name) return;
    if (!raLouCount[name]) raLouCount[name] = new Set();
    if (ra._louLei) raLouCount[name].add(ra._louLei);
  });

  var html = '<div class="profile-ra-list">';
  rasList.forEach(function(ra) {
    var rattr = ra.attributes || {};
    var name = rattr.name || ra.id;
    var louCount = raLouCount[name] ? raLouCount[name].size : 1;
    var loyaltyClass = louCount === 1 ? 'exclusive' : louCount === 2 ? 'dual' : 'multi';
    var loyaltyLabel = louCount === 1 ? 'Exclusive' : louCount === 2 ? 'Dual' : 'Multi (' + louCount + ')';
    var websites = rattr.websites || [];
    html += '<div class="profile-ra-item">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    html += '<span class="loyalty-badge ' + loyaltyClass + '">' + pEsc(loyaltyLabel) + '</span>';
    html += '<strong>' + pEsc(name) + '</strong>';
    html += '</div>';
    if (websites.length > 0) {
      html += '<div style="font-size:12px;color:var(--accent-blue)">' + websites.map(function(w) { return pEsc(w); }).join(', ') + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderProfileGeo(louLei) {
  var jurs = App.data.jurisdictions[louLei] || [];
  if (jurs.length === 0) {
    return '<p style="color:var(--text-muted);padding:20px">No jurisdiction data available.</p>';
  }

  // Latest volume per country
  var history = App.data.history || [];
  var latest = history.length > 0 ? history[history.length - 1] : null;
  var byCountry = (latest && latest.byLouByCountry && latest.byLouByCountry[louLei]) || {};

  var html = '<table class="intel-table"><thead><tr><th>Country</th><th>Today\'s Volume</th></tr></thead><tbody>';
  jurs.sort(function(a, b) {
    var ca = a.attributes && a.attributes.countryCode;
    var cb = b.attributes && b.attributes.countryCode;
    return (byCountry[cb] || 0) - (byCountry[ca] || 0);
  }).forEach(function(j) {
    var cc = j.attributes && j.attributes.countryCode;
    var vol = byCountry[cc] || 0;
    html += '<tr><td>' + pEsc(cc || '\u2014') + '</td><td>' + (vol > 0 ? vol.toLocaleString() : '\u2014') + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}

function renderProfileTrends(louLei, canvasId, shareCanvasId) {
  var history = App.data.history || [];
  var msHistory = App.data.marketShareHistory || [];

  // Destroy old charts
  if (_profileChart) { try { _profileChart.destroy(); } catch(e) {} _profileChart = null; }
  if (_profileShareChart) { try { _profileShareChart.destroy(); } catch(e) {} _profileShareChart = null; }

  var last90 = history.slice(-90);
  var labels = last90.map(function(d) { return d.date || ''; });
  var vals = last90.map(function(d) { return (d.byLou && d.byLou[louLei]) || 0; });

  var html = '<div style="margin-bottom:24px"><div class="chart-card-header"><span class="chart-title">Daily New LEIs \u2014 Last 90 Days</span></div><div class="chart-container"><canvas id="' + pEsc(canvasId) + '"></canvas></div></div>';
  html += '<div><div class="chart-card-header"><span class="chart-title">Market Share Over Time</span></div><div class="chart-container"><canvas id="' + pEsc(shareCanvasId) + '"></canvas></div></div>';

  // Charts are initialized after DOM insert
  return html;
}

function initProfileCharts(louLei, canvasId, shareCanvasId) {
  var history = App.data.history || [];
  var msHistory = App.data.marketShareHistory || [];
  var last90 = history.slice(-90);
  var labels = last90.map(function(d) { return d.date || ''; });
  var vals = last90.map(function(d) { return (d.byLou && d.byLou[louLei]) || 0; });

  var c1 = document.getElementById(canvasId);
  if (c1) {
    _profileChart = new Chart(c1, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'New LEIs', data: vals, backgroundColor: 'rgba(0,212,255,0.6)', borderColor: '#00d4ff', borderWidth: 1 }] },
      options: Object.assign({}, App.chartDefaults || {}, { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 10 } } } })
    });
  }

  if (msHistory.length > 0) {
    var shareLabels = msHistory.map(function(s) { return s.date || ''; });
    var shareVals = msHistory.map(function(s) { return s.byLou && s.byLou[louLei] ? (s.byLou[louLei].share * 100) : 0; });
    var c2 = document.getElementById(shareCanvasId);
    if (c2) {
      _profileShareChart = new Chart(c2, {
        type: 'line',
        data: { labels: shareLabels, datasets: [{ label: 'Market Share %', data: shareVals, borderColor: '#00e676', backgroundColor: 'rgba(0,230,118,0.1)', fill: true, tension: 0.3 }] },
        options: Object.assign({}, App.chartDefaults || {}, { plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: function(v) { return v.toFixed(2) + '%'; } } } } })
      });
    }
  }
}

// ---- Profile tab switching ----

function activateProfileTab(tab, louLei) {
  var body = document.getElementById('profile-body');
  if (!body) return;

  document.querySelectorAll('.profile-tab').forEach(function(t) { t.classList.remove('active'); });
  var btn = document.querySelector('.profile-tab[data-ptab="' + tab + '"]');
  if (btn) btn.classList.add('active');

  // Destroy charts if leaving trends tab
  if (tab !== 'trends') {
    if (_profileChart) { try { _profileChart.destroy(); } catch(e) {} _profileChart = null; }
    if (_profileShareChart) { try { _profileShareChart.destroy(); } catch(e) {} _profileShareChart = null; }
  }

  var lou = App.data.louMap && App.data.louMap[louLei];
  if (!lou) { body.innerHTML = '<p style="padding:20px;color:var(--text-muted)">LOU data not found.</p>'; return; }

  if (tab === 'overview') {
    body.innerHTML = renderProfileOverview(lou, louLei);
  } else if (tab === 'ras') {
    body.innerHTML = renderProfileRAs(louLei);
  } else if (tab === 'geo') {
    body.innerHTML = renderProfileGeo(louLei);
  } else if (tab === 'trends') {
    body.innerHTML = renderProfileTrends(louLei, 'profile-trend-chart', 'profile-share-chart');
    setTimeout(function() { initProfileCharts(louLei, 'profile-trend-chart', 'profile-share-chart'); }, 50);
  }
}

// ---- Public API ----

App.views.showLouProfile = function(louLei) {
  var overlay = document.getElementById('lou-profile-overlay');
  var lou = App.data.louMap && App.data.louMap[louLei];
  if (!overlay || !lou) return;

  var attr = lou.attributes || {};
  document.getElementById('profile-name').textContent = attr.name || louLei;
  document.getElementById('profile-lei').textContent = louLei;

  // Wire up tab buttons
  overlay._louLei = louLei;
  document.querySelectorAll('.profile-tab').forEach(function(btn) {
    btn.onclick = function() { activateProfileTab(btn.getAttribute('data-ptab'), louLei); };
  });

  // Show overlay
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Default tab
  activateProfileTab('overview', louLei);
};

App.views.hideLouProfile = function() {
  var overlay = document.getElementById('lou-profile-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
  if (_profileChart) { try { _profileChart.destroy(); } catch(e) {} _profileChart = null; }
  if (_profileShareChart) { try { _profileShareChart.destroy(); } catch(e) {} _profileShareChart = null; }
};

// Wire close button once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('profile-close');
  if (closeBtn) closeBtn.addEventListener('click', App.views.hideLouProfile);
});
