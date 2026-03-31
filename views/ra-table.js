'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initRaTable = function() {
  var el = document.getElementById('ra-table');
  if (!el) return;

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return s; };

  // Group RA records by company name — one company can be authorized by multiple LOUs
  // and may have multiple websites. Aggregate all into one table row per company.
  var byName = {};

  App.data.ras.forEach(function(ra) {
    var attrs = ra.attributes || {};
    var name = (attrs.name || ra.id || '').trim();
    var louLei = ra._louLei;
    var websites = (attrs.websites && attrs.websites.length > 0)
      ? attrs.websites
      : (attrs.website ? [attrs.website] : []);

    if (!byName[name]) {
      byName[name] = {
        name: name,
        ids: [],
        lous: [],    // { lei, name }
        websites: [],
      };
    }

    var group = byName[name];

    // Collect IDs (LEIs or API IDs)
    if (ra.id && !group.ids.includes(ra.id)) group.ids.push(ra.id);

    // Collect parent LOUs
    if (louLei && App.data.louMap[louLei]) {
      var alreadyHas = group.lous.some(function(l) { return l.lei === louLei; });
      if (!alreadyHas) {
        group.lous.push({ lei: louLei, name: louName(App.data.louMap[louLei]) });
      }
    }

    // Collect unique websites
    websites.forEach(function(url) {
      url = url.trim();
      if (url && !group.websites.includes(url)) group.websites.push(url);
    });
  });

  var tableData = Object.values(byName);
  tableData.sort(function(a, b) { return a.name.localeCompare(b.name); });

  new Tabulator('#ra-table', {
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
        title: 'LEI / ID',
        field: 'ids',
        widthGrow: 2,
        responsive: 3,
        sorter: function(a, b) {
          return (a[0] || '').localeCompare(b[0] || '');
        },
        formatter: function(cell) {
          var ids = cell.getValue();
          if (!ids || ids.length === 0) return '<span style="color:var(--text-secondary)">—</span>';
          return ids.map(function(id) {
            return '<span style="font-family:monospace;font-size:11px;color:var(--text-secondary);display:block">' + escHtml(id) + '</span>';
          }).join('');
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
          return rowValue.some(function(l) { return l.name.toLowerCase().includes(q); });
        },
        headerFilterPlaceholder: 'Filter LOU...',
        widthGrow: 2.5,
        formatter: function(cell) {
          var lous = cell.getValue();
          if (!lous || lous.length === 0) return '<span style="color:var(--text-secondary)">—</span>';
          return '<div class="cell-tags">' + lous.map(function(l) {
            return '<span class="cell-tag">' + escHtml(l.name) + '</span>';
          }).join('') + '</div>';
        },
      },
      {
        title: 'Website(s)',
        field: 'websites',
        widthGrow: 2.5,
        responsive: 2,
        sorter: function(a, b) {
          return (a[0] || '').localeCompare(b[0] || '');
        },
        formatter: function(cell) {
          var urls = cell.getValue();
          if (!urls || urls.length === 0) return '<span style="color:var(--text-secondary)">—</span>';
          return urls.map(function(url) {
            var label = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            return '<a class="cell-link" style="display:block" href="' + escHtml(url) + '" target="_blank" rel="noopener">↗ ' + escHtml(label) + '</a>';
          }).join('');
        },
      },
    ],
  });
};
