'use strict';

window.App = window.App || {};
App.views = App.views || {};

var _raTable = null;

App.views.initRaTable = function() {
  var el = document.getElementById('ra-table');
  if (!el) return;

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return String(s); };

  // Group RA records by company name
  var byName = {};

  App.data.ras.forEach(function(ra) {
    var attrs = ra.attributes || {};
    var name = (attrs.name || ra.id || '').trim();
    var louLei = ra._louLei;
    var websites = (attrs.websites && attrs.websites.length > 0)
      ? attrs.websites
      : (attrs.website ? [attrs.website] : []);

    if (!byName[name]) {
      byName[name] = { name: name, ids: [], lous: [], websites: [], louCount: 0 };
    }

    var group = byName[name];
    if (ra.id && group.ids.indexOf(ra.id) === -1) group.ids.push(ra.id);

    if (louLei && App.data.louMap[louLei]) {
      var alreadyHas = group.lous.some(function(l) { return l.lei === louLei; });
      if (!alreadyHas) {
        group.lous.push({ lei: louLei, name: louName(App.data.louMap[louLei]) });
      }
    }

    websites.forEach(function(url) {
      url = url.trim();
      if (url && group.websites.indexOf(url) === -1) group.websites.push(url);
    });
  });

  var tableData = Object.values(byName).map(function(row) {
    row.louCount = row.lous.length;
    row.loyalty = row.louCount === 1 ? 'Exclusive' : row.louCount === 2 ? 'Dual' : 'Multi';
    return row;
  });

  tableData.sort(function(a, b) { return a.name.localeCompare(b.name); });

  // Wire export button
  var exportBtn = document.getElementById('ra-export-btn');
  if (exportBtn) {
    exportBtn.onclick = function() {
      if (_raTable) _raTable.download('csv', 'ra-directory.csv');
    };
  }

  // Wire multi-LOU filter toggle
  var multiFilter = document.getElementById('ra-multi-filter');
  if (multiFilter) {
    multiFilter.addEventListener('change', function() {
      if (!_raTable) return;
      if (multiFilter.checked) {
        _raTable.setFilter(function(row) { return row.louCount >= 2; });
      } else {
        _raTable.clearFilter(true);
      }
    });
  }

  _raTable = new Tabulator('#ra-table', {
    data: tableData,
    layout: 'fitColumns',
    responsiveLayout: 'hide',
    pagination: true,
    paginationSize: 20,
    paginationSizeSelector: [10, 20, 40],
    movableColumns: false,

    columns: [
      {
        title: 'Name',
        field: 'name',
        sorter: 'string',
        headerFilter: 'input',
        headerFilterPlaceholder: 'Search...',
        widthGrow: 3,
        formatter: function(cell) {
          return '<strong style="color:var(--text-primary)">' + escHtml(cell.getValue()) + '</strong>';
        },
      },
      {
        title: 'Loyalty',
        field: 'loyalty',
        sorter: 'string',
        hozAlign: 'center',
        widthGrow: 0.8,
        formatter: function(cell) {
          var v = cell.getValue();
          var cls = v === 'Exclusive' ? 'exclusive' : v === 'Dual' ? 'dual' : 'multi';
          return '<span class="loyalty-badge ' + cls + '">' + escHtml(v) + '</span>';
        },
      },
      {
        title: 'Parent LOU(s)',
        field: 'lous',
        sorter: function(a, b) {
          return (a[0] ? a[0].name : '').localeCompare(b[0] ? b[0].name : '');
        },
        headerFilter: 'input',
        headerFilterFunc: function(headerValue, rowValue) {
          var q = headerValue.toLowerCase();
          return rowValue.some(function(l) { return l.name.toLowerCase().indexOf(q) !== -1; });
        },
        headerFilterPlaceholder: 'Filter LOU...',
        widthGrow: 2.5,
        formatter: function(cell) {
          var lous = cell.getValue();
          if (!lous || lous.length === 0) return '<span style="color:var(--text-secondary)">\u2014</span>';
          return '<div class="cell-tags">' + lous.map(function(l) {
            return '<span class="cell-tag" style="cursor:pointer" onclick="App.views.showLouProfile && App.views.showLouProfile(\'' + escHtml(l.lei) + '\')">' + escHtml(l.name) + '</span>';
          }).join('') + '</div>';
        },
      },
      {
        title: 'Website(s)',
        field: 'websites',
        widthGrow: 2.5,
        responsive: 2,
        sorter: function(a, b) { return (a[0] || '').localeCompare(b[0] || ''); },
        formatter: function(cell) {
          var urls = cell.getValue();
          if (!urls || urls.length === 0) return '<span style="color:var(--text-secondary)">\u2014</span>';
          return urls.map(function(url) {
            var label = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            return '<a class="cell-link" style="display:block" href="' + escHtml(url) + '" target="_blank" rel="noopener">\u2197 ' + escHtml(label) + '</a>';
          }).join('');
        },
      },
    ],
  });
};
