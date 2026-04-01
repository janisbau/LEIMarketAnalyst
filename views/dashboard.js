'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initDashboard = function() {
  renderKPIs();
  renderMarketHealth();
  renderDashboardInsights();
  renderDashboardChart();
  renderMarketShareChart();
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function louName(lou) {
  return (lou.attributes && (lou.attributes.marketingName || lou.attributes.name)) || lou.id;
}

App.helpers = { louName: louName, escHtml: escHtml };

function sumByCountrySlice(slice) {
  var out = {};
  slice.forEach(function(d) {
    if (!d.byCountry) return;
    Object.keys(d.byCountry).forEach(function(cc) { out[cc] = (out[cc] || 0) + d.byCountry[cc]; });
  });
  return out;
}

function sumByLouSlice(slice) {
  var out = {};
  slice.forEach(function(d) {
    if (!d.byLou) return;
    Object.keys(d.byLou).forEach(function(lei) { out[lei] = (out[lei] || 0) + d.byLou[lei]; });
  });
  return out;
}

function objTotal(obj) {
  return Object.values(obj).reduce(function(s, v) { return s + v; }, 0);
}

// Compute 7-day momentum delta %: returns null if not enough data
function momentumPct(history) {
  var last7 = history.slice(-7);
  var prior7 = history.slice(-14, -7);
  if (!last7.length || !prior7.length) return null;
  var cur = last7.reduce(function(s, d) { return s + (d.totalDelta || 0); }, 0);
  var prv = prior7.reduce(function(s, d) { return s + (d.totalDelta || 0); }, 0);
  if (prv === 0) return null;
  return Math.round(((cur - prv) / prv) * 100);
}

function momentumHtml(pct) {
  if (pct === null) return '';
  if (pct > 0) return '<span class="kpi-delta" style="color:#00e676;font-size:11px;margin-left:6px">▲ +' + pct + '%</span>';
  if (pct < 0) return '<span class="kpi-delta" style="color:#ff1744;font-size:11px;margin-left:6px">▼ ' + pct + '%</span>';
  return '<span class="kpi-delta" style="color:#8892a4;font-size:11px;margin-left:6px">— 0%</span>';
}

function kpiCard(label, value, sub, colorClass, deltaHtml) {
  return '<div class="kpi-card ' + (colorClass || '') + '">' +
    '<div class="kpi-label">' + escHtml(label) + '</div>' +
    '<div class="kpi-value">' + escHtml(String(value)) + (deltaHtml || '') + '</div>' +
    '<div class="kpi-sub">' + escHtml(String(sub)) + '</div>' +
    '</div>';
}

// ── KPI Grid ─────────────────────────────────────────────────────────────────

function renderKPIs() {
  var d = App.data;
  var grid = document.getElementById('kpi-grid');
  if (!grid) return;

  var history = d.history || [];
  var mp = momentumPct(history);

  var louCount = d.lous.length;
  var raCount = d.ras.length;
  var countryCount = Object.keys(d.countryCoverage).length;
  var avgRas = louCount > 0 ? (raCount / louCount).toFixed(1) : 0;

  var topLouByRa = null, topRaCount = 0;
  d.lous.forEach(function(lou) {
    var c = (d.rasByLou[lou.id] || []).length;
    if (c > topRaCount) { topRaCount = c; topLouByRa = lou; }
  });

  var topLouByCountry = null, topCountryCount = 0;
  d.lous.forEach(function(lou) {
    var c = (d.jurisdictions[lou.id] || []).length;
    if (c > topCountryCount) { topCountryCount = c; topLouByCountry = lou; }
  });

  var todayDelta = d.stats && d.stats.totalDelta != null ? d.stats.totalDelta.toLocaleString() : '—';

  grid.innerHTML =
    kpiCard('Active LOUs', louCount, 'Accredited LEI issuers', '') +
    kpiCard('Registration Agents', raCount, 'Global distributors', 'green') +
    kpiCard('Countries Covered', countryCount, 'With at least one LOU', '') +
    kpiCard('Avg RAs per LOU', avgRas, 'Distribution depth', '') +
    kpiCard('Top LOU by RAs', topRaCount, topLouByRa ? louName(topLouByRa) : '—', 'gold') +
    kpiCard('Top LOU by Countries', topCountryCount, topLouByCountry ? louName(topLouByCountry) : '—', 'gold') +
    kpiCard("Today's New LEIs", todayDelta, d.stats && d.stats.date ? 'As of ' + d.stats.date : 'Pipeline data pending', 'green', momentumHtml(mp));
}

// ── Market Health KPI Row ─────────────────────────────────────────────────────

function renderMarketHealth() {
  var d = App.data;
  var healthGrid = document.getElementById('kpi-health-grid');

  // If the container doesn't exist yet, inject it after kpi-grid
  if (!healthGrid) {
    var kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<h3 style="margin:20px 0 10px;font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Market Health</h3>' +
      '<div id="kpi-health-grid" class="kpi-grid"></div>';
    kpiGrid.parentNode.insertBefore(wrapper, kpiGrid.nextSibling);
    healthGrid = document.getElementById('kpi-health-grid');
    if (!healthGrid) return;
  }

  var ms = d.marketShare;
  var activeLeis = '—';
  if (ms && ms.totalActive != null) {
    activeLeis = ms.totalActive.toLocaleString();
  } else if (d.stats && d.stats.statusBreakdown) {
    var sb = d.stats.statusBreakdown;
    activeLeis = (sb.ISSUED || sb.issued || 0).toLocaleString();
  }

  // Global lapse rate
  var lapseRate = '—';
  if (ms && ms.byLou) {
    var totalLapsed = 0, totalAll = 0;
    Object.values(ms.byLou).forEach(function(e) {
      totalLapsed += (e.lapsed || 0);
      totalAll += (e.total || 0);
    });
    if (totalAll > 0) lapseRate = (totalLapsed / totalAll * 100).toFixed(1) + '%';
  } else if (d.stats && d.stats.statusBreakdown) {
    var sb2 = d.stats.statusBreakdown;
    var issued = sb2.ISSUED || sb2.issued || 0;
    var lapsed = sb2.LAPSED || sb2.lapsed || 0;
    var ttl = issued + lapsed;
    if (ttl > 0) lapseRate = (lapsed / ttl * 100).toFixed(1) + '%';
  }

  // Transfers
  var transfersIn = 0, transfersOut = 0;
  if (d.stats && d.stats.transfers) {
    var inflows = d.stats.transfers.inflows || {};
    var outflows = d.stats.transfers.outflows || {};
    transfersIn = Object.values(inflows).reduce(function(s, v) { return s + v; }, 0);
    transfersOut = Object.values(outflows).reduce(function(s, v) { return s + v; }, 0);
  }

  healthGrid.innerHTML =
    kpiCard('Active LEIs Globally', activeLeis, ms ? 'From market share data' : 'Pipeline pending', 'blue') +
    kpiCard('Global Lapse Rate', lapseRate, 'Lapsed ÷ total issued', lapseRate !== '—' && parseFloat(lapseRate) > 20 ? 'red' : '') +
    kpiCard('Transfers In (today)', transfersIn.toLocaleString(), 'LEIs transferred to a LOU', 'green') +
    kpiCard('Transfers Out (today)', transfersOut.toLocaleString(), 'LEIs transferred away', '');
}

// ── Market Intelligence Section ───────────────────────────────────────────────

function renderDashboardInsights() {
  // Ensure App.views.generateInsights is available (from intelligence.js)
  // If not loaded yet, skip gracefully
  if (typeof App.views.generateInsights !== 'function') return;

  var existing = document.getElementById('dashboard-insights');
  if (!existing) {
    var healthGrid = document.getElementById('kpi-health-grid');
    var anchor = healthGrid ? healthGrid.parentNode : document.getElementById('kpi-grid');
    if (!anchor) return;
    var sec = document.createElement('div');
    sec.id = 'dashboard-insights';
    sec.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px 20px;margin:20px 0';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    existing = sec;
  }

  var insights = App.views.generateInsights().slice(0, 3);
  if (!insights.length) {
    existing.style.display = 'none';
    return;
  }

  var html = '<h3 style="margin:0 0 10px;font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Market Intelligence</h3><ul style="list-style:none;margin:0;padding:0">';
  insights.forEach(function(ins) {
    var dotColor = ins.type === 'positive' ? '#00e676' : ins.type === 'warning' ? '#ff1744' : '#ffd600';
    html += '<li style="display:flex;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';margin:4px 10px 0 0;flex-shrink:0"></span>' +
      '<span style="font-size:13px;color:var(--text-primary);line-height:1.5">' + ins.text + '</span>' +
      '</li>';
  });
  html += '</ul>';
  existing.innerHTML = html;
}

// ── 30-day Line Chart ─────────────────────────────────────────────────────────

function renderDashboardChart() {
  var canvas = document.getElementById('dashboard-chart');
  if (!canvas) return;

  var history = App.data.history || [];
  var last30 = history.slice(-30);

  var badge = document.getElementById('dashboard-chart-badge');
  if (badge) {
    badge.textContent = last30.length > 0 ? last30.length + ' days' : 'Pipeline data pending';
  }

  if (last30.length === 0) {
    canvas.parentElement.innerHTML =
      '<p style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center">' +
      'Trend data will appear after the GitHub Actions pipeline runs for the first time.<br>' +
      '<span style="font-size:11px;opacity:0.7">Trigger it manually via Actions → Update LEI Statistics → Run workflow</span>' +
      '</p>';
    return;
  }

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: last30.map(function(d) { return d.date; }),
      datasets: [{
        label: 'New LEIs',
        data: last30.map(function(d) { return d.totalDelta; }),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      }],
    },
    options: App.chartDefaults({
      scales: { x: { ticks: { maxTicksLimit: 10, maxRotation: 0 } } },
    }),
  });
}

// ── Market Share Bar Chart ────────────────────────────────────────────────────

function renderMarketShareChart() {
  var ms = App.data.marketShare;
  if (!ms || !ms.byLou) return;

  // Find or create the chart container
  var chartSection = document.getElementById('dashboard-chart').closest
    ? document.getElementById('dashboard-chart').closest('.chart-card, .card, section, div[id]')
    : null;

  var shareCanvasId = 'dashboard-share-chart';
  if (document.getElementById(shareCanvasId)) return; // already rendered

  // Inject after the 30-day chart's parent
  var chartParent = document.getElementById('dashboard-chart') &&
    document.getElementById('dashboard-chart').parentNode;
  if (!chartParent) return;

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-top:20px';
  wrapper.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px 20px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<span style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Market Share — Top 10 LOUs</span>' +
        '<span style="font-size:11px;color:var(--text-secondary)">' + escHtml(ms.date || '') + '</span>' +
      '</div>' +
      '<div style="position:relative;height:260px"><canvas id="' + shareCanvasId + '"></canvas></div>' +
    '</div>';

  chartParent.parentNode.insertBefore(wrapper, chartParent.nextSibling);

  var canvas = document.getElementById(shareCanvasId);
  if (!canvas) return;

  // Build top-10 by active share
  var entries = Object.keys(ms.byLou).map(function(lei) {
    var e = ms.byLou[lei];
    return { lei: lei, share: e.share || 0, active: e.active || 0 };
  });
  entries.sort(function(a, b) { return b.share - a.share; });
  var top10 = entries.slice(0, 10);

  var labels = top10.map(function(e) {
    var lou = App.data.louMap && App.data.louMap[e.lei];
    var name = lou ? louName(lou) : e.lei.substring(0, 12) + '…';
    return name.length > 28 ? name.substring(0, 26) + '…' : name;
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Market Share %',
        data: top10.map(function(e) { return +(e.share * 100).toFixed(2); }),
        backgroundColor: [
          'rgba(0,212,255,0.7)', 'rgba(0,230,118,0.6)', 'rgba(255,214,0,0.6)',
          'rgba(0,212,255,0.5)', 'rgba(0,230,118,0.45)', 'rgba(255,214,0,0.45)',
          'rgba(0,212,255,0.35)', 'rgba(0,230,118,0.35)', 'rgba(255,214,0,0.35)', 'rgba(136,146,164,0.4)',
        ],
        borderColor: '#1e2a3a',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: App.chartDefaults({
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: function(v) { return v + '%'; } } },
        y: { ticks: { font: { size: 11 } } },
      },
    }),
  });
}

// ── Chart defaults (shared) ───────────────────────────────────────────────────

function chartDefaults(extra) {
  var opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111827',
        titleColor: '#e8eaf0',
        bodyColor: '#8892a4',
        borderColor: '#1e2a3a',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(30,42,58,0.8)' },
        ticks: { color: '#8892a4', font: { size: 11 } },
      },
      y: {
        grid: { color: 'rgba(30,42,58,0.8)' },
        ticks: { color: '#8892a4', font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };
  if (extra && extra.scales) {
    Object.assign(opts.scales.x, extra.scales.x || {});
    Object.assign(opts.scales.y, extra.scales.y || {});
    delete extra.scales;
  }
  return Object.assign(opts, extra);
}

App.chartDefaults = chartDefaults;
