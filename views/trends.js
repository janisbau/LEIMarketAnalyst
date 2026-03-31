'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initTrends = function() {
  renderDailyChart();
  renderLouVolumeChart();
  renderCountryVolumeChart();
  renderAccreditationChart();
};

function renderDailyChart() {
  var canvas = document.getElementById('trends-daily-chart');
  if (!canvas) return;

  var history = App.data.history || [];
  var last90 = history.slice(-90);

  if (last90.length === 0) {
    showNoPipelineMessage(canvas);
    return;
  }

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: last90.map(function(d) { return d.date; }),
      datasets: [{
        label: 'New LEIs',
        data: last90.map(function(d) { return d.totalDelta; }),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.06)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      }],
    },
    options: App.chartDefaults({
      scales: {
        x: { ticks: { maxTicksLimit: 15, maxRotation: 0 } },
      },
    }),
  });
}

function renderLouVolumeChart() {
  var canvas = document.getElementById('trends-lou-chart');
  if (!canvas) return;

  var history = App.data.history || [];
  var last30 = history.slice(-30);

  if (last30.length === 0) {
    showNoPipelineMessage(canvas);
    return;
  }

  // Aggregate by LOU over last 30 days
  var louTotals = {};
  last30.forEach(function(day) {
    if (!day.byLou) return;
    Object.keys(day.byLou).forEach(function(lei) {
      louTotals[lei] = (louTotals[lei] || 0) + day.byLou[lei];
    });
  });

  // Sort and take top 15
  var sorted = Object.keys(louTotals)
    .map(function(lei) { return { lei: lei, count: louTotals[lei] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 15);

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var labels = sorted.map(function(item) {
    var lou = App.data.louMap[item.lei];
    return lou ? shortName(louName(lou)) : item.lei.substring(0, 12) + '…';
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '30-day LEIs',
        data: sorted.map(function(item) { return item.count; }),
        backgroundColor: 'rgba(0,212,255,0.6)',
        borderColor: '#00d4ff',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: App.chartDefaults({
      indexAxis: 'y',
      scales: {
        x: {},
        y: { ticks: { font: { size: 11 } } },
      },
    }),
  });
}

function renderCountryVolumeChart() {
  var canvas = document.getElementById('trends-country-chart');
  if (!canvas) return;

  var history = App.data.history || [];
  var last30 = history.slice(-30);

  if (last30.length === 0) {
    showNoPipelineMessage(canvas);
    return;
  }

  var countryTotals = {};
  last30.forEach(function(day) {
    if (!day.byCountry) return;
    Object.keys(day.byCountry).forEach(function(cc) {
      countryTotals[cc] = (countryTotals[cc] || 0) + day.byCountry[cc];
    });
  });

  var sorted = Object.keys(countryTotals)
    .map(function(cc) { return { cc: cc, count: countryTotals[cc] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 15);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(function(item) { return item.cc; }),
      datasets: [{
        label: '30-day LEIs',
        data: sorted.map(function(item) { return item.count; }),
        backgroundColor: 'rgba(0,230,118,0.5)',
        borderColor: '#00e676',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: App.chartDefaults({
      indexAxis: 'y',
      scales: {
        x: {},
        y: { ticks: { font: { size: 11 } } },
      },
    }),
  });
}

function renderAccreditationChart() {
  var canvas = document.getElementById('trends-accreditation-chart');
  if (!canvas) return;

  var lous = App.data.lous.slice();

  // Sort LOUs by accreditation date
  lous.sort(function(a, b) {
    var da = (a.attributes && a.attributes.accreditationDate) || '';
    var db = (b.attributes && b.attributes.accreditationDate) || '';
    return da.localeCompare(db);
  });

  var labels = [];
  var counts = [];
  var cumulative = 0;

  lous.forEach(function(lou) {
    var date = lou.attributes && lou.attributes.accreditationDate;
    if (!date) return;
    var year = date.substring(0, 4);
    cumulative++;
    labels.push(year + ' · ' + shortName(App.helpers ? App.helpers.louName(lou) : lou.id));
    counts.push(cumulative);
  });

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cumulative LOUs',
        data: counts,
        borderColor: '#ffd600',
        backgroundColor: 'rgba(255,214,0,0.07)',
        fill: true,
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
        stepped: 'before',
      }],
    },
    options: App.chartDefaults({
      scales: {
        x: { ticks: { maxTicksLimit: 12, maxRotation: 45 } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    }),
  });
}

function showNoPipelineMessage(canvas) {
  canvas.parentElement.innerHTML =
    '<p style="color:var(--text-secondary);font-size:13px;padding:40px 20px;text-align:center">' +
    'Trend data will appear after the GitHub Actions pipeline runs.<br>' +
    '<span style="font-size:11px;opacity:0.6">Actions → Update LEI Statistics → Run workflow</span>' +
    '</p>';
}

function shortName(name) {
  return name.length > 32 ? name.substring(0, 30) + '…' : name;
}
