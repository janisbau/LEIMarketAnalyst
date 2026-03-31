'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initDashboard = function() {
  renderKPIs();
  renderDashboardChart();
};

function renderKPIs() {
  var d = App.data;
  var grid = document.getElementById('kpi-grid');
  if (!grid) return;

  var louCount = d.lous.length;
  var raCount = d.ras.length;
  var countryCount = Object.keys(d.countryCoverage).length;
  var avgRas = louCount > 0 ? (raCount / louCount).toFixed(1) : 0;

  // Top LOU by RA count
  var topLouByRa = null, topRaCount = 0;
  d.lous.forEach(function(lou) {
    var c = (d.rasByLou[lou.id] || []).length;
    if (c > topRaCount) { topRaCount = c; topLouByRa = lou; }
  });

  // Top LOU by country count
  var topLouByCountry = null, topCountryCount = 0;
  d.lous.forEach(function(lou) {
    var c = (d.jurisdictions[lou.id] || []).length;
    if (c > topCountryCount) { topCountryCount = c; topLouByCountry = lou; }
  });

  // Today's delta from stats
  var todayDelta = d.stats && d.stats.totalDelta != null ? d.stats.totalDelta.toLocaleString() : '—';

  var cards = [
    {
      label: 'Active LOUs',
      value: louCount,
      sub: 'Accredited LEI issuers',
      color: '',
    },
    {
      label: 'Registration Agents',
      value: raCount,
      sub: 'Global distributors',
      color: 'green',
    },
    {
      label: 'Countries Covered',
      value: countryCount,
      sub: 'With at least one LOU',
      color: '',
    },
    {
      label: 'Avg RAs per LOU',
      value: avgRas,
      sub: 'Distribution depth',
      color: '',
    },
    {
      label: 'Top LOU by RAs',
      value: topRaCount,
      sub: topLouByRa ? louName(topLouByRa) : '—',
      color: 'gold',
    },
    {
      label: 'Top LOU by Countries',
      value: topCountryCount,
      sub: topLouByCountry ? louName(topLouByCountry) : '—',
      color: 'gold',
    },
    {
      label: "Today's New LEIs",
      value: todayDelta,
      sub: d.stats && d.stats.date ? 'As of ' + d.stats.date : 'Pipeline data pending',
      color: 'green',
    },
  ];

  grid.innerHTML = cards.map(function(c) {
    return '<div class="kpi-card ' + c.color + '">' +
      '<div class="kpi-label">' + escHtml(c.label) + '</div>' +
      '<div class="kpi-value">' + (typeof c.value === 'number' ? c.value.toLocaleString() : escHtml(String(c.value))) + '</div>' +
      '<div class="kpi-sub">' + escHtml(String(c.sub)) + '</div>' +
      '</div>';
  }).join('');
}

function renderDashboardChart() {
  var canvas = document.getElementById('dashboard-chart');
  if (!canvas) return;

  var history = App.data.history || [];
  var last30 = history.slice(-30);

  var badge = document.getElementById('dashboard-chart-badge');
  if (badge) {
    badge.textContent = last30.length > 0
      ? last30.length + ' days'
      : 'Pipeline data pending';
  }

  if (last30.length === 0) {
    // Show placeholder message instead of empty chart
    var ctx = canvas.getContext('2d');
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
    options: chartDefaults({
      scales: {
        x: { ticks: { maxTicksLimit: 10, maxRotation: 0 } },
      },
    }),
  });
}

// ---- Shared Chart.js defaults ----
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
  // Shallow merge extra.scales
  if (extra && extra.scales) {
    Object.assign(opts.scales.x, extra.scales.x || {});
    Object.assign(opts.scales.y, extra.scales.y || {});
    delete extra.scales;
  }
  return Object.assign(opts, extra);
}

// Expose for reuse in trends.js
App.chartDefaults = chartDefaults;

// ---- Helpers ----
function louName(lou) {
  return (lou.attributes && (lou.attributes.marketingName || lou.attributes.name)) || lou.id;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose helpers for other views
App.helpers = { louName: louName, escHtml: escHtml };
