'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initRaTable = function() {
  var el = document.getElementById('ra-table');
  if (!el) return;

  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return s; };

  var tableData = App.data.ras.map(function(ra) {
    var attrs = ra.attributes || {};
    var louLei = ra._louLei;
    var parentLou = louLei ? App.data.louMap[louLei] : null;
    var websites = attrs.websites || (attrs.website ? [attrs.website] : []);

    return {
      id: ra.id,
      name: attrs.name || ra.id,
      lei: ra.id || '',
      parentLouName: parentLou ? louName(parentLou) : (louLei || '—'),
      parentLouLei: louLei || '',
      website: websites[0] || '',
    };
  });

  // Sort alphabetically by name
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
        field: 'lei',
        sorter: 'string',
        widthGrow: 2,
        responsive: 3,
        formatter: function(cell) {
          var v = cell.getValue();
          if (!v) return '<span style="color:var(--text-secondary)">—</span>';
          return '<span style="font-family:monospace;font-size:11px;color:var(--text-secondary)">' + escHtml(v) + '</span>';
        },
      },
      {
        title: 'Parent LOU',
        field: 'parentLouName',
        sorter: 'string',
        headerFilter: 'input',
        headerFilterPlaceholder: 'Filter LOU...',
        widthGrow: 2.5,
        formatter: function(cell) {
          var row = cell.getRow().getData();
          if (!row.parentLouLei) return '<span style="color:var(--text-secondary)">—</span>';
          return '<span style="color:var(--accent-blue)">' + escHtml(cell.getValue()) + '</span>';
        },
      },
      {
        title: 'Website',
        field: 'website',
        widthGrow: 2,
        responsive: 2,
        formatter: function(cell) {
          var v = cell.getValue();
          if (!v) return '<span style="color:var(--text-secondary)">—</span>';
          return '<a class="cell-link" href="' + escHtml(v) + '" target="_blank" rel="noopener">↗ ' + escHtml(v.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>';
        },
      },
    ],
  });
};
