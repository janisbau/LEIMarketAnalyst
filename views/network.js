'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initNetwork = function() {
  var container = document.getElementById('network-graph');
  if (!container) return;

  var d = App.data;
  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return s; };

  // ---- Build nodes ----
  var nodes = new vis.DataSet();
  var edges = new vis.DataSet();

  // Max RA count for size scaling
  var maxRaCount = 1;
  d.lous.forEach(function(lou) {
    var c = (d.rasByLou[lou.id] || []).length;
    if (c > maxRaCount) maxRaCount = c;
  });

  // Max today's delta for size modulation (if available)
  var maxDelta = 1;
  if (d.stats && d.stats.byLou) {
    Object.values(d.stats.byLou).forEach(function(v) {
      if (v > maxDelta) maxDelta = v;
    });
  }

  // Add LOU nodes
  d.lous.forEach(function(lou) {
    var name = louName(lou);
    var raCount = (d.rasByLou[lou.id] || []).length;
    var delta = (d.stats && d.stats.byLou && d.stats.byLou[lou.id]) || 0;
    var countryCount = (d.jurisdictions[lou.id] || []).length;

    // Size: base 28, scaled by RA count, boosted by today's delta
    var size = 28 + (raCount / maxRaCount) * 22;
    if (delta > 0) size += (delta / maxDelta) * 12;

    nodes.add({
      id: lou.id,
      label: name.length > 28 ? name.substring(0, 26) + '…' : name,
      shape: 'dot',
      size: size,
      color: {
        background: '#00d4ff',
        border: '#0099bb',
        highlight: { background: '#33ddff', border: '#00d4ff' },
        hover: { background: '#33ddff', border: '#00d4ff' },
      },
      font: { color: '#e8eaf0', size: 12, face: 'Inter, sans-serif', strokeWidth: 2, strokeColor: '#080c17' },
      title: name,
      _type: 'lou',
      _data: lou,
    });
  });

  // Add RA nodes and edges
  d.ras.forEach(function(ra, i) {
    var name = (ra.attributes && ra.attributes.name) || 'RA ' + i;
    var louLei = ra._louLei;

    nodes.add({
      id: 'ra_' + (ra.id || i),
      label: name.length > 24 ? name.substring(0, 22) + '…' : name,
      shape: 'square',
      size: 10,
      color: {
        background: '#2a3a50',
        border: '#3a5070',
        highlight: { background: '#8892a4', border: '#aab2c0' },
        hover: { background: '#3a5070', border: '#8892a4' },
      },
      font: { color: '#8892a4', size: 10, face: 'Inter, sans-serif', strokeWidth: 2, strokeColor: '#080c17' },
      title: name,
      _type: 'ra',
      _data: ra,
    });

    if (louLei && d.louMap[louLei]) {
      edges.add({
        from: 'ra_' + (ra.id || i),
        to: louLei,
        color: { color: '#1e2a3a', highlight: '#00d4ff', hover: '#2a3a50' },
        width: 1,
        hoverWidth: 2,
        smooth: { type: 'continuous', roundness: 0.2 },
      });
    }
  });

  // ---- vis.js Network options ----
  var options = {
    physics: {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -60,
        centralGravity: 0.005,
        springLength: 120,
        springConstant: 0.06,
        damping: 0.4,
        avoidOverlap: 0.5,
      },
      stabilization: {
        enabled: true,
        iterations: 300,
        updateInterval: 25,
        fit: true,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      zoomView: true,
      dragView: true,
    },
    nodes: { borderWidth: 1.5 },
    edges: { arrows: { to: { enabled: false } } },
  };

  var network = new vis.Network(container, { nodes: nodes, edges: edges }, options);

  // Freeze physics after stabilization for smooth interaction
  network.on('stabilized', function() {
    network.setOptions({ physics: false });
  });

  // ---- Click handler: show sidebar ----
  network.on('click', function(params) {
    if (params.nodes.length === 0) {
      // Clicked empty space — reset highlights, hide sidebar
      nodes.forEach(function(n) {
        nodes.update({ id: n.id, opacity: 1 });
      });
      hideSidebar();
      return;
    }

    var nodeId = params.nodes[0];
    var node = nodes.get(nodeId);
    if (!node) return;

    // Dim nodes not connected to this one
    var connectedNodeIds = network.getConnectedNodes(nodeId);
    connectedNodeIds.push(nodeId);
    var connectedSet = {};
    connectedNodeIds.forEach(function(id) { connectedSet[id] = true; });
    nodes.forEach(function(n) {
      nodes.update({ id: n.id, opacity: connectedSet[n.id] ? 1 : 0.15 });
    });

    if (node._type === 'lou') {
      showLouSidebar(node._data, escHtml, louName);
    } else {
      showRaSidebar(node._data, escHtml);
    }
  });
};

function showLouSidebar(lou, escHtml, louName) {
  var name = louName(lou);
  var lei = lou.id || '—';
  var attrs = lou.attributes || {};
  var website = attrs.website || null;
  var accDate = attrs.accreditationDate ? attrs.accreditationDate.substring(0, 10) : '—';
  var ras = (App.data.rasByLou[lei] || []);
  var jurisdictions = (App.data.jurisdictions[lei] || []);
  var delta = (App.data.stats && App.data.stats.byLou && App.data.stats.byLou[lei]) || null;

  var html = '<span class="sidebar-type-badge lou">LOU</span>' +
    '<div class="sidebar-name">' + escHtml(name) + '</div>' +
    '<div class="sidebar-lei">' + escHtml(lei) + '</div>';

  html += '<div class="sidebar-section">' +
    '<div class="sidebar-section-title">Details</div>' +
    sidebarStat('Accreditation Date', accDate) +
    sidebarStat('Countries', jurisdictions.length) +
    sidebarStat('Registration Agents', ras.length) +
    (delta !== null ? sidebarStat("Today's New LEIs", delta.toLocaleString()) : '') +
    (website ? '<div class="sidebar-stat"><span>Website</span><span><a class="cell-link" href="' + escHtml(website) + '" target="_blank" rel="noopener">↗ Visit</a></span></div>' : '') +
    '</div>';

  if (ras.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">Registration Agents (' + ras.length + ')</div>';
    ras.forEach(function(ra) {
      html += '<div class="sidebar-list-item">' + escHtml((ra.attributes && ra.attributes.name) || ra.id) + '</div>';
    });
    html += '</div>';
  }

  if (jurisdictions.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">Jurisdictions (' + jurisdictions.length + ')</div>';
    jurisdictions.slice(0, 20).forEach(function(j) {
      var cc = (j.attributes && j.attributes.countryCode) || '—';
      html += '<div class="sidebar-list-item">' + escHtml(cc) + '</div>';
    });
    if (jurisdictions.length > 20) html += '<div class="sidebar-list-item" style="color:var(--text-secondary)">…and ' + (jurisdictions.length - 20) + ' more</div>';
    html += '</div>';
  }

  renderSidebar(html);
}

function showRaSidebar(ra, escHtml) {
  var attrs = ra.attributes || {};
  var name = attrs.name || ra.id;
  var lei = ra.id || '—';
  var louLei = ra._louLei;
  var parentLou = louLei && App.data.louMap[louLei];
  var parentName = parentLou ? (App.helpers ? App.helpers.louName(parentLou) : louLei) : '—';
  var websites = attrs.websites || (attrs.website ? [attrs.website] : []);

  var html = '<span class="sidebar-type-badge ra">Registration Agent</span>' +
    '<div class="sidebar-name">' + escHtml(name) + '</div>' +
    '<div class="sidebar-lei">' + escHtml(lei) + '</div>';

  html += '<div class="sidebar-section">' +
    '<div class="sidebar-section-title">Details</div>' +
    sidebarStat('Parent LOU', parentName) +
    (websites.length > 0 ? '<div class="sidebar-stat"><span>Website</span><span><a class="cell-link" href="' + escHtml(websites[0]) + '" target="_blank" rel="noopener">↗ Visit</a></span></div>' : '') +
    '</div>';

  renderSidebar(html);
}

function sidebarStat(label, value) {
  return '<div class="sidebar-stat"><span>' + label + '</span><span>' + value + '</span></div>';
}

function renderSidebar(html) {
  var sidebar = document.getElementById('network-sidebar');
  var content = document.getElementById('network-sidebar-content');
  if (!sidebar || !content) return;
  content.innerHTML = html;
  sidebar.classList.remove('hidden');
}

function hideSidebar() {
  var sidebar = document.getElementById('network-sidebar');
  if (sidebar) sidebar.classList.add('hidden');
}

// Close button
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('network-sidebar-close');
  if (btn) btn.addEventListener('click', hideSidebar);
});
