'use strict';

// ===================================================
// views/intelligence.js — Market Intelligence view
// Implements: REQ-03, REQ-07, REQ-08, REQ-14, REQ-16, REQ-21
// ===================================================

App.views = App.views || {};

// ---- Insights generator (called by dashboard.js too) ----

App.views.generateInsights = function() {
  var insights = [];
  var history = App.data.history || [];
  var marketShare = App.data.marketShare;
  var ras = App.data.ras || [];
  var countryCoverage = App.data.countryCoverage || {};

  function louName(lei) {
    var lou = App.data.louMap && App.data.louMap[lei];
    return lou ? (lou.attributes && lou.attributes.name) || lei : lei;
  }

  // 1. Global 7-day momentum
  if (history.length >= 14) {
    var last7 = history.slice(-7).reduce(function(s, d) { return s + (d.newLEIs || 0); }, 0);
    var prev7 = history.slice(-14, -7).reduce(function(s, d) { return s + (d.newLEIs || 0); }, 0);
    if (prev7 > 0) {
      var pct = ((last7 - prev7) / prev7 * 100).toFixed(1);
      var dir = pct >= 0 ? 'up' : 'down';
      insights.push({ text: 'Global LEI issuance is ' + dir + ' ' + Math.abs(pct) + '% this week vs last week (' + last7.toLocaleString() + ' vs ' + prev7.toLocaleString() + ' new LEIs).', type: pct >= 0 ? 'positive' : 'warning' });
    }
  }

  // 2. Fastest growing country (last 30d vs prior 30d)
  if (history.length >= 30) {
    var countryLast = {}, countryPrev = {};
    history.slice(-30).forEach(function(d) {
      if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
        countryLast[cc] = (countryLast[cc] || 0) + (d.byCountry[cc] || 0);
      });
    });
    history.slice(-60, -30).forEach(function(d) {
      if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
        countryPrev[cc] = (countryPrev[cc] || 0) + (d.byCountry[cc] || 0);
      });
    });
    var bestCC = null, bestGrowth = -Infinity;
    Object.keys(countryLast).forEach(function(cc) {
      var p = countryPrev[cc] || 0;
      if (p > 50) {
        var g = (countryLast[cc] - p) / p;
        if (g > bestGrowth) { bestGrowth = g; bestCC = cc; }
      }
    });
    if (bestCC && bestGrowth > 0.05) {
      insights.push({ text: 'Fastest growing country (30d): ' + bestCC + ' \u2014 up ' + (bestGrowth * 100).toFixed(0) + '% vs prior 30 days.', type: 'positive' });
    }
  }

  // 3. Fastest growing LOU (30d)
  if (history.length >= 30) {
    var louLast = {}, louPrev = {};
    history.slice(-30).forEach(function(d) {
      if (d.byLou) Object.keys(d.byLou).forEach(function(lei) {
        louLast[lei] = (louLast[lei] || 0) + (d.byLou[lei] || 0);
      });
    });
    history.slice(-60, -30).forEach(function(d) {
      if (d.byLou) Object.keys(d.byLou).forEach(function(lei) {
        louPrev[lei] = (louPrev[lei] || 0) + (d.byLou[lei] || 0);
      });
    });
    var bestLou = null, bestLouG = -Infinity;
    Object.keys(louLast).forEach(function(lei) {
      var p = louPrev[lei] || 0;
      if (p > 20) {
        var g = (louLast[lei] - p) / p;
        if (g > bestLouG) { bestLouG = g; bestLou = lei; }
      }
    });
    if (bestLou && bestLouG > 0.1) {
      insights.push({ text: 'Fastest growing LOU (30d): ' + louName(bestLou) + ' \u2014 up ' + (bestLouG * 100).toFixed(0) + '% vs prior 30 days.', type: 'positive' });
    }
  }

  // 4. Highest lapse rate LOU
  if (marketShare && marketShare.byLou) {
    var worstLou = null, worstLapse = 0;
    Object.keys(marketShare.byLou).forEach(function(lei) {
      var d = marketShare.byLou[lei];
      if (d.total > 100) {
        var lr = d.lapsed / d.total;
        if (lr > worstLapse) { worstLapse = lr; worstLou = lei; }
      }
    });
    if (worstLou && worstLapse > 0.15) {
      insights.push({ text: 'Highest lapse rate: ' + louName(worstLou) + ' at ' + (worstLapse * 100).toFixed(1) + '% \u2014 potential transfer opportunity.', type: 'warning' });
    }
  }

  // 5. Whitespace countries (volume but no home LOU)
  var louHomeCountries = App.data.louHomeCountries || {};
  var homeCCs = new Set(Object.values(louHomeCountries));
  var whitespace = Object.keys(countryCoverage).filter(function(cc) {
    return (countryCoverage[cc] || []).length > 0 && !homeCCs.has(cc);
  });
  if (whitespace.length > 0) {
    insights.push({ text: whitespace.length + ' countries have LEI issuance activity but no locally-headquartered LOU \u2014 entry opportunity: ' + whitespace.slice(0, 5).join(', ') + (whitespace.length > 5 ? '\u2026' : '') + '.', type: 'neutral' });
  }

  // 6. Multi-LOU RA count
  var raLouCount = {};
  ras.forEach(function(ra) {
    var name = ra.attributes && ra.attributes.name;
    if (!name) return;
    if (!raLouCount[name]) raLouCount[name] = new Set();
    if (ra._louLei) raLouCount[name].add(ra._louLei);
  });
  var multiCount = Object.values(raLouCount).filter(function(s) { return s.size >= 2; }).length;
  if (multiCount > 0) {
    insights.push({ text: multiCount + ' Registration Agents work with multiple LOUs \u2014 potential channel partners for new market entrants.', type: 'neutral' });
  }

  // 7. Transfer outflow warning
  var latest = history.length > 0 ? history[history.length - 1] : null;
  if (latest && latest.transfers && latest.transfers.outflows) {
    var outflows = latest.transfers.outflows;
    var topOut = Object.keys(outflows).sort(function(a, b) { return outflows[b] - outflows[a]; })[0];
    if (topOut && outflows[topOut] >= 20) {
      insights.push({ text: 'Transfer alert: ' + louName(topOut) + ' had ' + outflows[topOut] + ' pending outbound transfers today \u2014 possible client dissatisfaction signal.', type: 'warning' });
    }
  }

  if (insights.length === 0) {
    insights.push({ text: 'Collecting market intelligence\u2026 Run the GitHub Actions pipeline to populate trend data.', type: 'neutral' });
  }

  return insights;
};

// ---- Opportunity Score computation ----

function computeOpportunityScores() {
  var countryCoverage = App.data.countryCoverage || {};
  var history = App.data.history || [];
  var louHomeCountries = App.data.louHomeCountries || {};

  var vol30 = {}, volPrev = {};
  history.slice(-30).forEach(function(d) {
    if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
      vol30[cc] = (vol30[cc] || 0) + (d.byCountry[cc] || 0);
    });
  });
  history.slice(-60, -30).forEach(function(d) {
    if (d.byCountry) Object.keys(d.byCountry).forEach(function(cc) {
      volPrev[cc] = (volPrev[cc] || 0) + (d.byCountry[cc] || 0);
    });
  });

  var homeCCs = {};
  Object.values(louHomeCountries).forEach(function(cc) {
    homeCCs[cc] = (homeCCs[cc] || 0) + 1;
  });

  var allCCs = new Set(Object.keys(countryCoverage).concat(Object.keys(vol30)));
  var scores = [];

  allCCs.forEach(function(cc) {
    var louCount = (countryCoverage[cc] || []).length;
    var v30 = vol30[cc] || 0;
    var vPrev = volPrev[cc] || 0;

    // Coverage score: fewer LOUs = more opportunity (40pts max)
    var coverageScore = louCount === 0 ? 40 : louCount === 1 ? 30 : louCount === 2 ? 15 : 0;

    // Growth score (40pts max)
    var growthRate = vPrev > 0 ? (v30 - vPrev) / vPrev : 0;
    var growthScore = Math.min(40, Math.max(0, growthRate * 200));

    // HHI proxy: monopoly markets are high-opportunity for new entrant (20pts max)
    var hhiScore = louCount === 1 ? 20 : louCount >= 2 ? 10 : 0;

    var total = Math.round(Math.min(100, coverageScore + growthScore + hhiScore));

    scores.push({
      cc: cc,
      louCount: louCount,
      vol30: v30,
      growthRate: growthRate,
      score: total
    });
  });

  return scores.sort(function(a, b) { return b.score - a.score; });
}

// ---- Render helpers ----

function iEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInsightBullets(container) {
  var insights = App.views.generateInsights();
  var html = '<div class="intel-section"><h2>Market Intelligence</h2><ul class="insight-list">';
  insights.forEach(function(ins) {
    html += '<li class="insight-item"><span class="insight-dot ' + iEsc(ins.type) + '"></span><span>' + iEsc(ins.text) + '</span></li>';
  });
  html += '</ul></div>';
  container.insertAdjacentHTML('beforeend', html);
}

function renderOpportunityScores(container) {
  var scores = computeOpportunityScores().slice(0, 40);
  var html = '<div class="intel-section"><h2>Country Opportunity Scores</h2>';
  html += '<p class="view-subtitle" style="margin-bottom:12px">Composite score (0\u2013100): market coverage gaps + growth momentum + concentration. Higher = more opportunity for a new LOU.</p>';
  html += '<table class="intel-table"><thead><tr><th>Country</th><th>Score</th><th>Active LOUs</th><th>30d Volume</th><th>30d Growth</th></tr></thead><tbody>';
  scores.forEach(function(s) {
    var badge = s.score >= 60 ? 'high' : s.score >= 30 ? 'medium' : 'low';
    var gStr = s.growthRate > 0 ? '+' + (s.growthRate * 100).toFixed(0) + '%' : s.growthRate < 0 ? (s.growthRate * 100).toFixed(0) + '%' : '\u2014';
    html += '<tr><td>' + iEsc(s.cc) + '</td>';
    html += '<td><span class="score-badge ' + badge + '">' + s.score + '</span></td>';
    html += '<td>' + s.louCount + '</td>';
    html += '<td>' + (s.vol30 > 0 ? s.vol30.toLocaleString() : '\u2014') + '</td>';
    html += '<td>' + gStr + '</td></tr>';
  });
  html += '</tbody></table></div>';
  container.insertAdjacentHTML('beforeend', html);
}

function renderWhitespaceCountries(container) {
  var louHomeCountries = App.data.louHomeCountries || {};
  var countryCoverage = App.data.countryCoverage || {};
  var homeCCs = new Set(Object.values(louHomeCountries));

  var whitespace = Object.keys(countryCoverage).filter(function(cc) {
    return (countryCoverage[cc] || []).length > 0 && !homeCCs.has(cc);
  }).sort();

  var html = '<div class="intel-section"><h2>Whitespace Countries</h2>';
  html += '<p class="view-subtitle" style="margin-bottom:12px">Countries where LEIs are actively issued but no LOU is locally headquartered \u2014 greenfield entry opportunities.</p>';
  if (whitespace.length === 0) {
    html += '<p style="color:var(--text-muted)">No whitespace detected \u2014 or home country data not yet available (run the monthly pipeline).</p>';
  } else {
    html += '<table class="intel-table"><thead><tr><th>Country</th><th>LOUs Operating Here</th></tr></thead><tbody>';
    whitespace.forEach(function(cc) {
      var louNames = (countryCoverage[cc] || []).map(function(lei) {
        return (App.data.louMap[lei] && App.data.louMap[lei].attributes && App.data.louMap[lei].attributes.name) || lei;
      });
      html += '<tr><td>' + iEsc(cc) + '</td><td>' + iEsc(louNames.join(', ')) + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  container.insertAdjacentHTML('beforeend', html);
}

function renderRACoverageGaps(container) {
  var countryCoverage = App.data.countryCoverage || {};
  var rasByLou = App.data.rasByLou || {};

  var raCountByCC = {};
  Object.keys(countryCoverage).forEach(function(cc) {
    var count = 0;
    (countryCoverage[cc] || []).forEach(function(lei) {
      count += (rasByLou[lei] || []).length;
    });
    raCountByCC[cc] = count;
  });

  var gaps = Object.keys(raCountByCC).filter(function(cc) {
    return (countryCoverage[cc] || []).length > 0 && raCountByCC[cc] === 0;
  }).sort();

  var sparse = Object.keys(raCountByCC).filter(function(cc) {
    return (countryCoverage[cc] || []).length > 0 && raCountByCC[cc] > 0 && raCountByCC[cc] <= 2;
  }).sort(function(a, b) { return raCountByCC[a] - raCountByCC[b]; });

  var html = '<div class="intel-section"><h2>RA Coverage Gaps</h2>';
  html += '<p class="view-subtitle" style="margin-bottom:12px">Countries with active LEI issuance but few or no Registration Agents \u2014 distribution channel gaps.</p>';

  if (gaps.length > 0) {
    html += '<h3 style="color:var(--accent-red);margin:12px 0 8px">No RAs (distribution gap)</h3>';
    html += '<table class="intel-table"><thead><tr><th>Country</th><th>LOUs Operating</th><th>RAs</th></tr></thead><tbody>';
    gaps.forEach(function(cc) {
      html += '<tr><td>' + iEsc(cc) + '</td><td>' + (countryCoverage[cc] || []).length + '</td><td style="color:var(--accent-red)">0</td></tr>';
    });
    html += '</tbody></table>';
  }

  if (sparse.length > 0) {
    html += '<h3 style="color:#ffd700;margin:16px 0 8px">Sparse RA coverage (1\u20132 agents)</h3>';
    html += '<table class="intel-table"><thead><tr><th>Country</th><th>LOUs</th><th>RAs</th></tr></thead><tbody>';
    sparse.slice(0, 20).forEach(function(cc) {
      html += '<tr><td>' + iEsc(cc) + '</td><td>' + (countryCoverage[cc] || []).length + '</td><td>' + raCountByCC[cc] + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  if (gaps.length === 0 && sparse.length === 0) {
    html += '<p style="color:var(--text-muted)">All covered countries have RA representation.</p>';
  }

  html += '</div>';
  container.insertAdjacentHTML('beforeend', html);
}

function renderRegulatoryContext(container) {
  var ctx = App.data.regulatoryContext || {};
  var countries = Object.keys(ctx);

  var html = '<div class="intel-section"><h2>Regulatory Context</h2>';
  html += '<p class="view-subtitle" style="margin-bottom:12px">Jurisdictions with mandatory or voluntary LEI requirements. High adoption = established demand. Low adoption = growth runway.</p>';
  html += '<table class="intel-table"><thead><tr><th>Jurisdiction</th><th>Adoption</th><th>Est. Entities</th><th>Key Regulations</th></tr></thead><tbody>';

  var order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  countries.sort(function(a, b) {
    return (order[ctx[a].adoptionLevel] || 3) - (order[ctx[b].adoptionLevel] || 3);
  }).forEach(function(cc) {
    var c = ctx[cc];
    var badge = (c.adoptionLevel || 'LOW').toLowerCase();
    var regs = (c.regulations || []).map(function(r) {
      return '<span class="mandatory-badge ' + (r.mandatory ? 'yes' : 'no') + '">' + iEsc(r.name) + ' (' + r.year + ')</span>';
    }).join(' ');
    html += '<tr>';
    html += '<td><strong>' + iEsc(c.name || cc) + '</strong></td>';
    html += '<td><span class="score-badge ' + badge + '">' + iEsc(c.adoptionLevel || '') + '</span></td>';
    html += '<td>' + (c.estimatedEntities ? c.estimatedEntities.toLocaleString() : '\u2014') + '</td>';
    html += '<td>' + regs + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.insertAdjacentHTML('beforeend', html);
}

// ---- Main entry point ----

App.views.initIntelligence = function() {
  var container = document.getElementById('intelligence-content');
  if (!container) return;
  container.innerHTML = '';
  renderInsightBullets(container);
  renderOpportunityScores(container);
  renderWhitespaceCountries(container);
  renderRACoverageGaps(container);
  renderRegulatoryContext(container);
};
