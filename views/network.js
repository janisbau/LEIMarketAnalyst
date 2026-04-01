'use strict';

window.App = window.App || {};
App.views = App.views || {};

App.views.initNetwork = function() {
  var container = document.getElementById('network-graph');
  if (!container) return;

  var d = App.data;
  var louName = App.helpers ? App.helpers.louName : function(l) { return l.id; };
  var escHtml = App.helpers ? App.helpers.escHtml : function(s) { return String(s); };

  var nodes = new vis.DataSet();
  var edges = new vis.DataSet();

  var maxRaCount = 1;
  d.lous.forEach(function(lou) {
    var c = (d.rasByLou[lou.id] || []).length;
    if (c > maxRaCount) maxRaCount = c;
  });

  var maxDelta = 1;
  if (d.stats && d.stats.byLou) {
    Object.values(d.stats.byLou).forEach(function(v) {
      if (v > maxDelta) maxDelta = v;
    });
  }

  // Compute per-LOU 30d activity for RA activity weighting
  var louActivity = {}; // lei -> 30d total
  var maxLouActivity = 1;
  (d.history || []).slice(-30).forEach(function(day) {
    if (!day.byLou) return;
    Object.keys(day.byLou).forEach(function(lei) {
      louActivity[lei] = (louActivity[lei] || 0) + day.byLou[lei];
    });
  });
  Object.values(louActivity).forEach(function(v) { if (v > maxLouActivity) maxLouActivity = v; });

  // Add LOU nodes
  d.lous.forEach(function(lou) {
    var name = louName(lou);
    var raCount = (d.rasByLou[lou.id] || []).length;
    var delta = (d.stats && d.stats.byLou && d.stats.byLou[lou.id]) || 0;
    var size = 28 + (raCount / maxRaCount) * 22;
    if (delta > 0) size += (delta / maxDelta) * 12;

    nodes.add({
      id: lou.id,
      label: name.length > 28 ? name.substring(0, 26) + '\u2026' : name,
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

  // Add RA nodes with activity-weighted size/color
  d.ras.forEach(function(ra, i) {
    var name = (ra.attributes && ra.attributes.name) || 'RA ' + i;
    var louLei = ra._louLei;
    var raCountForParent = louLei ? (d.rasByLou[louLei] || []).length : 1;
    var parentActivity = louLei ? (louActivity[louLei] || 0) : 0;
    // Activity proxy: parent LOU 30d activity shared equally among its RAs
    var raActivity = raCountForParent > 0 ? parentActivity / raCountForParent : 0;
    var activityRatio = maxLouActivity > 0 ? raActivity / maxLouActivity : 0;
    // Size: 8-16 based on activity
    var raSize = 8 + activityRatio * 8;
    // Color: darker grey when inactive, lighter when active
    var greyVal = Math.round(42 + activityRatio * 80); // 42 to 122
    var greyHex = greyVal.toString(16).padStart(2, '0');
    var raBg = '#' + greyHex + greyHex + (Math.min(255, greyVal + 40)).toString(16).padStart(2, '0');

    nodes.add({
      id: 'ra_' + (ra.id || i),
      label: name.length > 24 ? name.substring(0, 22) + '\u2026' : name,
      shape: 'square',
      size: raSize,
      color: {
        background: raBg,
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
      stabilization: { enabled: true, iterations: 300, updateInterval: 25, fit: true },
    },
    interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
    nodes: { borderWidth: 1.5 },
    edges: { arrows: { to: { enabled: false } } },
  };

  var network = new vis.Network(container, { nodes: nodes, edges: edges }, options);

  network.on('stabilized', function() {
    network.setOptions({ physics: false });
  });

  network.on('click', function(params) {
    if (params.nodes.length === 0) {
      nodes.forEach(function(n) { nodes.update({ id: n.id, opacity: 1 }); });
      hideSidebar();
      return;
    }

    var nodeId = params.nodes[0];
    var node = nodes.get(nodeId);
    if (!node) return;

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
  var lei = lou.id || '\u2014';
  var attrs = lou.attributes || {};
  var website = attrs.website || null;
  var accDate = attrs.accreditationDate ? attrs.accreditationDate.substring(0, 10) : '\u2014';
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
    (website ? '<div class="sidebar-stat"><span>Website</span><span><a class="cell-link" href="' + escHtml(website) + '" target="_blank" rel="noopener">\u2197 Visit</a></span></div>' : '') +
    '</div>';

  // View Full Profile button
  html += '<div style="margin-top:16px"><button class="toolbar-btn toolbar-btn-accent" style="width:100%" onclick="App.views.showLouProfile && App.views.showLouProfile(\'' + escHtml(lei) + '\')">View Full Profile</button></div>';

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
      var cc = (j.attributes && j.attributes.countryCode) || '\u2014';
      html += '<div class="sidebar-list-item">' + escHtml(cc) + '</div>';
    });
    if (jurisdictions.length > 20) html += '<div class="sidebar-list-item" style="color:var(--text-secondary)">\u2026and ' + (jurisdictions.length - 20) + ' more</div>';
    html += '</div>';
  }

  renderSidebar(html);
}

function showRaSidebar(ra, escHtml) {
  var attrs = ra.attributes || {};
  var name = attrs.name || ra.id;
  var lei = ra.id || '\u2014';
  var louLei = ra._louLei;
  var parentLou = louLei && App.data.louMap[louLei];
  var parentName = parentLou ? (App.helpers ? App.helpers.louName(parentLou) : louLei) : '\u2014';
  var websites = attrs.websites || (attrs.website ? [attrs.website] : []);

  var html = '<span class="sidebar-type-badge ra">Registration Agent</span>' +
    '<div class="sidebar-name">' + escHtml(name) + '</div>' +
    '<div class="sidebar-lei">' + escHtml(lei) + '</div>';

  html += '<div class="sidebar-section">' +
    '<div class="sidebar-section-title">Details</div>' +
    sidebarStat('Parent LOU', parentName) +
    (websites.length > 0 ? '<div class="sidebar-stat"><span>Website</span><span><a class="cell-link" href="' + escHtml(websites[0]) + '" target="_blank" rel="noopener">\u2197 Visit</a></span></div>' : '') +
    '</div>';

  if (louLei) {
    html += '<div style="margin-top:12px"><button class="toolbar-btn" style="width:100%" onclick="App.views.showLouProfile && App.views.showLouProfile(\'' + escHtml(louLei) + '\')">View Parent LOU Profile</button></div>';
  }

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

document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('network-sidebar-close');
  if (btn) btn.addEventListener('click', hideSidebar);
});
