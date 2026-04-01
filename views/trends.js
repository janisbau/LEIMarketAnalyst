'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initTrends = function() {
  renderDailyChart();
  renderLouVolumeChart();
  renderCountryVolumeChart();
  renderAccreditationChart();
  renderMarketShareHistoryChart();
  renderStatusBreakdownChart();
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
      scales: { x: { ticks: { maxTicksLimit: 15, maxRotation: 0 } } },
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

  var louTotals = {};
  last30.forEach(function(day) {
    if (!day.byLou) return;
    Object.keys(day.byLou).forEach(function(lei) {
      louTotals[lei] = (louTotals[lei] || 0) + day.byLou[lei];
    });
  });

  var sorted = Object.keys(louTotals)
    .map(function(lei) { return { lei: lei, count: louTotals[lei] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 15);

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var labels = sorted.map(function(item) {
    var lou = App.data.louMap[item.lei];
    return lou ? shortName(louName(lou)) : item.lei.substring(0, 12) + '\u2026';
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
      scales: { x: {}, y: { ticks: { font: { size: 11 } } } },
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
      scales: { x: {}, y: { ticks: { font: { size: 11 } } } },
    }),
  });
}

function renderAccreditationChart() {
  var canvas = document.getElementById('trends-accreditation-chart');
  if (!canvas) return;

  var lous = App.data.lous.slice();
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
    labels.push(year + ' \u00b7 ' + shortName(App.helpers ? App.helpers.louName(lou) : lou.id));
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

// Chart 5: Market share over time (top 5 LOUs)
function renderMarketShareHistoryChart() {
  var trendsSection = document.getElementById('view-trends');
  if (!trendsSection) return;

  var wrapper = document.createElement('div');
  wrapper.className = 'chart-row';
  wrapper.innerHTML = '<div class="chart-card wide"><div class="chart-card-header"><span class="chart-title">Market Share Over Time \u2014 Top 5 LOUs</span></div><div class="chart-container"><canvas id="trends-share-chart"></canvas></div></div>';
  trendsSection.appendChild(wrapper);

  var canvas = document.getElementById('trends-share-chart');
  var msHistory = App.data.marketShareHistory || [];

  if (msHistory.length === 0) {
    showNoPipelineMessage(canvas);
    return;
  }

  // Find top 5 LOUs by latest share
  var latest = msHistory[msHistory.length - 1];
  var byLou = latest.byLou || {};
  var top5 = Object.keys(byLou)
    .sort(function(a, b) { return (byLou[b].share || 0) - (byLou[a].share || 0); })
    .slice(0, 5);

  var colors = ['#00d4ff', '#00e676', '#ffd600', '#ff9800', '#e040fb'];
  var louNameFn = App.helpers ? App.helpers.louName : function(l) { return l.id; };

  var datasets = top5.map(function(lei, i) {
    var lou = App.data.louMap[lei];
    return {
      label: lou ? shortName(louNameFn(lou)) : lei,
      data: msHistory.map(function(snapshot) {
        var e = snapshot.byLou && snapshot.byLou[lei];
        return e ? (e.share * 100) : 0;
      }),
      borderColor: colors[i],
      backgroundColor: 'transparent',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 2,
    };
  });

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: msHistory.map(function(s) { return s.date || ''; }),
      datasets: datasets,
    },
    options: App.chartDefaults({
      scales: {
        x: { ticks: { maxTicksLimit: 12 } },
        y: { ticks: { callback: function(v) { return v.toFixed(1) + '%'; } } },
      },
    }),
  });
}

// Chart 6: Status breakdown stacked bar (global, from history)
function renderStatusBreakdownChart() {
  var trendsSection = document.getElementById('view-trends');
  if (!trendsSection) return;

  var wrapper = document.createElement('div');
  wrapper.className = 'chart-row';
  wrapper.innerHTML = '<div class="chart-card wide"><div class="chart-card-header"><span class="chart-title">LEI Status Breakdown \u2014 Last 90 Days</span></div><div class="chart-container"><canvas id="trends-status-chart"></canvas></div></div>';
  trendsSection.appendChild(wrapper);

  var canvas = document.getElementById('trends-status-chart');
  var history = App.data.history || [];
  var last90 = history.slice(-90);

  // Collect all status keys that appear
  var statusKeys = {};
  last90.forEach(function(d) {
    if (d.statusBreakdown) {
      Object.keys(d.statusBreakdown).forEach(function(k) { statusKeys[k] = true; });
    }
  });

  var keys = Object.keys(statusKeys);
  if (keys.length === 0 || last90.length === 0) {
    showNoPipelineMessage(canvas);
    return;
  }

  var statusColors = {
    ISSUED: '#00e676',
    LAPSED: '#ff1744',
    PENDING_TRANSFER: '#ffd600',
    PENDING_ARCHIVAL: '#ff9800',
    ANNULLED: '#9e9e9e',
    MERGED: '#7c4dff',
    RETIRED: '#455a64',
    DUPLICATE: '#f06292',
    TRANSFERRED: '#40c4ff',
  };

  var datasets = keys.map(function(status) {
    return {
      label: status,
      data: last90.map(function(d) { return (d.statusBreakdown && d.statusBreakdown[status]) || 0; }),
      backgroundColor: statusColors[status] || '#888',
      borderWidth: 0,
    };
  });

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: last90.map(function(d) { return d.date || ''; }),
      datasets: datasets,
    },
    options: App.chartDefaults({
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 15, maxRotation: 0 } },
        y: { stacked: true },
      },
    }),
  });
}

function showNoPipelineMessage(canvas) {
  canvas.parentElement.innerHTML =
    '<p style="color:var(--text-secondary);font-size:13px;padding:40px 20px;text-align:center">' +
    'Trend data will appear after the GitHub Actions pipeline runs.<br>' +
    '<span style="font-size:11px;opacity:0.6">Actions \u2192 Update LEI Statistics \u2192 Run workflow</span>' +
    '</p>';
}

function shortName(name) {
  return name.length > 32 ? name.substring(0, 30) + '\u2026' : name;
}
