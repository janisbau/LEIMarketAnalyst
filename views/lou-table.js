'use strict';

window.App = window.App || {};
App.views = App.views || {};

var _louTable = null;

App.views.initLouTable = function() {
  var el = document.getElementById('lou-table');
  if (!el) return;

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return String(s); };

  var tableData = App.data.lous.map(function(lou) {
    var attrs = lou.attributes || {};
    var raCount = (App.data.rasByLou[lou.id] || []).length;
    var jurisdictions = (App.data.jurisdictions[lou.id] || []);
    var delta = (App.data.stats && App.data.stats.byLou && App.data.stats.byLou[lou.id]) || 0;
    var ms = App.data.marketShare && App.data.marketShare.byLou && App.data.marketShare.byLou[lou.id];

    return {
      id: lou.id,
      name: louName(lou),
      lei: lou.id,
      accreditationDate: attrs.accreditationDate ? attrs.accreditationDate.substring(0, 10) : '',
      countries: jurisdictions.length,
      raCount: raCount,
      todayLEIs: delta,
      website: attrs.website || '',
      marketShare: ms ? ms.share : null,
      lapseRate: ms && ms.total > 0 ? ms.lapsed / ms.total : null,
      _jurisdictions: jurisdictions,
      _ras: App.data.rasByLou[lou.id] || [],
    };
  });

  tableData.sort(function(a, b) { return b.raCount - a.raCount; });

  // Wire export button
  var exportBtn = document.getElementById('lou-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      if (_louTable) _louTable.download('csv', 'lou-directory.csv');
    });
  }

  _louTable = new Tabulator('#lou-table', {
    data: tableData,
    layout: 'fitColumns',
    responsiveLayout: 'hide',
    pagination: true,
    paginationSize: 20,
    paginationSizeSelector: [10, 20, 40],
    movableColumns: false,
    resizableRows: false,

    rowFormatter: function(row) {
      row.getElement().style.cursor = 'pointer';
    },

    rowClick: function(e, row) {
      // If click on compare checkbox, don't open profile
      if (e.target && e.target.classList.contains('compare-checkbox')) return;
      var d = row.getData();
      if (App.views.showLouProfile) App.views.showLouProfile(d.id);
    },

    rowDetail: function(row) {
      var d = row.getData();
      var el = document.createElement('div');
      el.style.cssText = 'padding:14px 20px;background:#080c17;';
      var sections = [];

      if (d._ras.length > 0) {
        var raHtml = '<strong style="color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Registration Agents</strong><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">';
        d._ras.forEach(function(ra) {
          raHtml += '<span style="background:var(--border);color:var(--text-primary);padding:3px 10px;border-radius:10px;font-size:12px">' + escHtml((ra.attributes && ra.attributes.name) || ra.id) + '</span>';
        });
        raHtml += '</div>';
        sections.push(raHtml);
      }

      if (d._jurisdictions.length > 0) {
        var jHtml = '<strong style="color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Accredited Jurisdictions</strong><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">';
        d._jurisdictions.forEach(function(j) {
          var cc = (j.attributes && j.attributes.countryCode) || '?';
          jHtml += '<span style="background:var(--border);color:var(--accent-blue);padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600">' + escHtml(cc) + '</span>';
        });
        jHtml += '</div>';
        sections.push(jHtml);
      }

      el.innerHTML = sections.join('<div style="height:14px"></div>');
      return el;
    },

    columns: [
      {
        title: '',
        field: 'id',
        width: 36,
        hozAlign: 'center',
        headerSort: false,
        formatter: function(cell) {
          var lei = cell.getValue();
          var checked = App.views.selectedForComparison && App.views.selectedForComparison.indexOf(lei) !== -1;
          return '<input type="checkbox" class="compare-checkbox" data-lei="' + escHtml(lei) + '"' + (checked ? ' checked' : '') + '>';
        },
        cellClick: function(e, cell) {
          var lei = cell.getValue();
          var added = App.views.toggleCompare(lei);
          cell.getElement().querySelector('input').checked = (added !== false && App.views.selectedForComparison.indexOf(lei) !== -1);
        },
      },
      {
        title: 'Name',
        field: 'name',
        sorter: 'string',
        headerFilter: 'input',
        headerFilterPlaceholder: 'Search...',
        widthGrow: 3,
        formatter: function(cell) {
          return '<strong style="color:var(--accent-blue);cursor:pointer">' + escHtml(cell.getValue()) + '</strong>';
        },
      },
      {
        title: 'LEI',
        field: 'lei',
        sorter: 'string',
        widthGrow: 2,
        responsive: 2,
        formatter: function(cell) {
          return '<span style="font-family:monospace;font-size:11px;color:var(--text-secondary)">' + escHtml(cell.getValue()) + '</span>';
        },
      },
      {
        title: 'Accredited',
        field: 'accreditationDate',
        sorter: 'date',
        widthGrow: 1,
        responsive: 3,
        formatter: function(cell) {
          return '<span style="color:var(--text-secondary)">' + (cell.getValue() || '\u2014') + '</span>';
        },
      },
      {
        title: 'Market Share',
        field: 'marketShare',
        sorter: 'number',
        hozAlign: 'right',
        widthGrow: 1,
        formatter: function(cell) {
          var v = cell.getValue();
          if (v == null) return '<span style="color:var(--text-secondary)">\u2014</span>';
          return '<span class="cell-number">' + v.toFixed(2) + '%</span>';
        },
      },
      {
        title: 'Lapse Rate',
        field: 'lapseRate',
        sorter: 'number',
        hozAlign: 'right',
        widthGrow: 0.9,
        formatter: function(cell) {
          var v = cell.getValue();
          if (v == null) return '<span style="color:var(--text-secondary)">\u2014</span>';
          var color = v > 0.25 ? 'var(--accent-red)' : v > 0.15 ? '#ff9800' : 'var(--accent-green)';
          return '<span style="color:' + color + ';font-weight:600">' + (v * 100).toFixed(1) + '%</span>';
        },
      },
      {
        title: 'Countries',
        field: 'countries',
        sorter: 'number',
        hozAlign: 'right',
        widthGrow: 0.8,
        formatter: function(cell) {
          return '<span class="cell-number">' + cell.getValue() + '</span>';
        },
      },
      {
        title: 'RAs',
        field: 'raCount',
        sorter: 'number',
        hozAlign: 'right',
        widthGrow: 0.7,
        formatter: function(cell) {
          return '<span class="cell-number">' + cell.getValue() + '</span>';
        },
      },
      {
        title: "Today's LEIs",
        field: 'todayLEIs',
        sorter: 'number',
        hozAlign: 'right',
        widthGrow: 0.9,
        formatter: function(cell) {
          var v = cell.getValue();
          if (!v) return '<span style="color:var(--text-secondary)">\u2014</span>';
          return '<span style="color:var(--accent-green);font-weight:600">+' + v.toLocaleString() + '</span>';
        },
      },
      {
        title: 'Website',
        field: 'website',
        widthGrow: 1.2,
        responsive: 4,
        formatter: function(cell) {
          var v = cell.getValue();
          if (!v) return '<span style="color:var(--text-secondary)">\u2014</span>';
          return '<a class="cell-link" href="' + escHtml(v) + '" target="_blank" rel="noopener">\u2197 ' + escHtml(v.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>';
        },
      },
    ],
  });
};
