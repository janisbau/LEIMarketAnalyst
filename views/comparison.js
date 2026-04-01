'use strict';

// ===================================================
// views/comparison.js — Side-by-side LOU comparison
// Implements: REQ-11
// ===================================================

App.views = App.views || {};
App.views.selectedForComparison = [];

var _comparisonChart = null;

function cEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cLouName(lei) {
  var lou = App.data.louMap && App.data.louMap[lei];
  return lou ? (lou.attributes && lou.attributes.name) || lei : lei;
}

// ---- Selection management ----

App.views.toggleCompare = function(louLei) {
  var idx = App.views.selectedForComparison.indexOf(louLei);
  if (idx === -1) {
    if (App.views.selectedForComparison.length >= 4) {
      alert('Maximum 4 LOUs can be compared at once.');
      return false;
    }
    App.views.selectedForComparison.push(louLei);
  } else {
    App.views.selectedForComparison.splice(idx, 1);
  }
  updateComparisonBar();
  return idx === -1; // true = was added
};

App.views.clearComparison = function() {
  App.views.selectedForComparison = [];
  updateComparisonBar();
  // Uncheck all checkboxes in the table
  document.querySelectorAll('.compare-checkbox').forEach(function(cb) { cb.checked = false; });
};

function updateComparisonBar() {
  var bar = document.getElementById('comparison-bar');
  var label = document.getElementById('comparison-bar-label');
  var count = App.views.selectedForComparison.length;
  if (!bar) return;
  if (count === 0) {
    bar.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    if (label) label.textContent = count + ' LOU' + (count > 1 ? 's' : '') + ' selected';
  }
  // Also update the header Compare button if it exists
  var btn = document.getElementById('lou-compare-btn');
  var countSpan = document.getElementById('compare-count');
  if (btn) {
    if (count >= 2) { btn.classList.remove('hidden'); } else { btn.classList.add('hidden'); }
  }
  if (countSpan) countSpan.textContent = count;
}

// ---- Comparison modal render ----

App.views.showComparison = function() {
  var leis = App.views.selectedForComparison;
  if (leis.length < 2) { alert('Select at least 2 LOUs to compare.'); return; }

  var modal = document.getElementById('comparison-modal');
  var content = document.getElementById('comparison-content');
  if (!modal || !content) return;

  if (_comparisonChart) { try { _comparisonChart.destroy(); } catch(e) {} _comparisonChart = null; }

  var rows = [
    { label: 'Market Share', key: 'share', format: function(v) { return v != null ? (v * 100).toFixed(2) + '%' : '\u2014'; } },
    { label: 'Active LEIs', key: 'active', format: function(v) { return v != null ? v.toLocaleString() : '\u2014'; } },
    { label: 'Lapsed LEIs', key: 'lapsed', format: function(v) { return v != null ? v.toLocaleString() : '\u2014'; } },
    { label: 'Lapse Rate', key: 'lapseRate', format: function(v) { return v != null ? (v * 100).toFixed(1) + '%' : '\u2014'; } },
    { label: 'Total LEIs', key: 'total', format: function(v) { return v != null ? v.toLocaleString() : '\u2014'; } },
    { label: 'Reg. Agents', key: 'raCount', format: function(v) { return v != null ? v : '\u2014'; } },
    { label: 'Countries', key: 'countries', format: function(v) { return v != null ? v : '\u2014'; } },
  ];

  // Gather data per LOU
  var louData = leis.map(function(lei) {
    var ms = App.data.marketShare && App.data.marketShare.byLou && App.data.marketShare.byLou[lei];
    var raCount = (App.data.rasByLou[lei] || []).length;
    var jurCount = (App.data.jurisdictions[lei] || []).length;
    return {
      lei: lei,
      name: cLouName(lei),
      share: ms ? ms.share : null,
      active: ms ? ms.active : null,
      lapsed: ms ? ms.lapsed : null,
      lapseRate: ms && ms.total > 0 ? ms.lapsed / ms.total : null,
      total: ms ? ms.total : null,
      raCount: raCount,
      countries: jurCount
    };
  });

  // Build grid HTML
  var colCount = leis.length;
  var html = '<div class="comparison-grid" style="grid-template-columns: 160px ' + Array(colCount).fill('1fr').join(' ') + '">';

  // Header row
  html += '<div class="comparison-cell header"></div>';
  louData.forEach(function(d) {
    html += '<div class="comparison-cell header">' + cEsc(d.name) + '<div style="font-size:11px;color:var(--text-muted);font-weight:400">' + cEsc(d.lei) + '</div></div>';
  });

  // Data rows
  rows.forEach(function(row) {
    html += '<div class="comparison-cell label">' + cEsc(row.label) + '</div>';
    louData.forEach(function(d) {
      html += '<div class="comparison-cell">' + row.format(d[row.key]) + '</div>';
    });
  });

  html += '</div>';

  // Bar chart of active LEIs
  html += '<div style="margin-top:24px"><div class="chart-container" style="height:220px"><canvas id="comparison-chart"></canvas></div></div>';

  content.innerHTML = html;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Draw chart
  setTimeout(function() {
    var ctx = document.getElementById('comparison-chart');
    if (!ctx) return;
    var colors = ['#00d4ff', '#00e676', '#ff9800', '#e040fb'];
    _comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: louData.map(function(d) { return d.name; }),
        datasets: [{
          label: 'Active LEIs',
          data: louData.map(function(d) { return d.active || 0; }),
          backgroundColor: louData.map(function(_, i) { return colors[i % colors.length]; }),
          borderWidth: 0
        }]
      },
      options: Object.assign({}, App.chartDefaults || {}, {
        plugins: { legend: { display: false } },
        indexAxis: 'y'
      })
    });
  }, 50);
};

App.views.hideComparison = function() {
  var modal = document.getElementById('comparison-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  if (_comparisonChart) { try { _comparisonChart.destroy(); } catch(e) {} _comparisonChart = null; }
};

// ---- Wire up DOM events once ready ----

document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('comparison-close');
  if (closeBtn) closeBtn.addEventListener('click', App.views.hideComparison);

  var backdrop = document.querySelector('#comparison-modal .modal-backdrop');
  if (backdrop) backdrop.addEventListener('click', App.views.hideComparison);

  var compareBarBtn = document.getElementById('comparison-bar-compare');
  if (compareBarBtn) compareBarBtn.addEventListener('click', App.views.showComparison);

  var clearBarBtn = document.getElementById('comparison-bar-clear');
  if (clearBarBtn) clearBarBtn.addEventListener('click', App.views.clearComparison);

  var compareHeaderBtn = document.getElementById('lou-compare-btn');
  if (compareHeaderBtn) compareHeaderBtn.addEventListener('click', App.views.showComparison);
});
