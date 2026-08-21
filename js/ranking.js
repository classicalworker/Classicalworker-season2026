function switchRankingSubTab(subTab){
  rankingSubTab = subTab;
  renderRanking();
}

function renderRanking(){
  const el = document.getElementById('view-ranking');
  const names = Object.keys(data.players);

  const subTabsHtml = `
    <div class="sub-tabs">
      <div class="sub-tab ${rankingSubTab === 'winrate' ? 'active' : ''}" onclick="switchRankingSubTab('winrate')">🏆 勝率ランキング</div>
      <div class="sub-tab ${rankingSubTab === 'mr' ? 'active' : ''}" onclick="switchRankingSubTab('mr')">📊 MRランキング</div>
    </div>
  `;

  if(rankingSubTab === 'mr'){
    const withMR = names
      .filter(n => data.players[n].maxMR && data.players[n].maxMR.trim() !== '')
      .map(n => ({
        name: n,
        mr: parseInt(data.players[n].maxMR, 10) || 0
      }))
      .filter(p => p.mr > 0);

    if(withMR.length === 0){
      el.innerHTML = subTabsHtml + '<div class="empty">MRが登録されているプレイヤーはいません</div>';
      return;
    }

    withMR.sort((a,b) => b.mr - a.mr);

    const MR_MIN = 1200;
    const MR_MAX = 2400;

    const legendHtml = `
      <div class="mr-legend">
        <span class="label">0</span>
        <div class="gradient-bar"></div>
        <span class="label">2400</span>
        <span class="label mid">▼1500(中央値)</span>
      </div>
    `;

    let html = '';
    withMR.forEach((p, i) => {
      const color = getMRColor(p.mr);
      const rankLabel = i + 1;
      const medal = rankLabel === 1 ? '🥇' : rankLabel === 2 ? '🥈' : rankLabel === 3 ? '🥉' : `#${rankLabel}`;
      const gaugePercent = Math.max(0, Math.min(((p.mr - MR_MIN) / (MR_MAX - MR_MIN)) * 100, 100));
      
      html += `
        <div class="rank-card ${rankLabel === 1 ? 'r1' : ''}">
          <div class="rank-num" style="color:${color}">${medal}</div>
          ${data.players[p.name].icon ? `<img class="member-icon" src="${data.players[p.name].icon}" alt="">` : `<div class="member-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>`}
          <div class="rank-body">
            <div class="rank-top">
              <span class="rank-name">${escapeHtml(p.name)}</span>
              <span class="rank-meta" style="font-size:20px;font-weight:800;color:${color}">${p.mr}</span>
            </div>
            <div class="gauge-row">
              <span class="gauge-label">MR</span>
              <div class="gauge">
                <div class="gauge-fill mr" style="width:${gaugePercent}%;"></div>
              </div>
              <span class="gauge-val" style="color:${color}">${p.mr}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:8px;color:var(--text-dim);padding:0 2px;margin-top:2px;">
              <span>${MR_MIN}</span>
              <span>中央値:1500</span>
              <span>${MR_MAX}</span>
            </div>
            ${memberMetaChipsHtml(data.players[p.name])}
          </div>
        </div>`;
    });

    const avgMR = withMR.reduce((sum, p) => sum + p.mr, 0) / withMR.length;
    const avgColor = getMRColor(avgMR);

    el.innerHTML = subTabsHtml + `
      <div style="margin-bottom:16px;text-align:center;font-size:13px;color:var(--text-dim)">
        平均MR: <span style="font-weight:800;color:${avgColor};font-size:18px">${avgMR.toFixed(0)}</span>
        （登録者 ${withMR.length}名）
      </div>
      ${legendHtml}
      ${html}
    `;
    return;
  }

  const withMatches = names.filter(n => (data.players[n].matches||[]).length>0);
  const withoutMatches = names.filter(n => (data.players[n].matches||[]).length===0);

  withMatches.sort((a,b)=>{
    const sa = computeStats(data.players[a]), sb = computeStats(data.players[b]);
    if(sb.winRate !== sa.winRate) return sb.winRate - sa.winRate;
    return sb.wins - sa.wins;
  });
  withoutMatches.sort((a,b)=>a.localeCompare(b,'ja'));

  const ordered = [...withMatches, ...withoutMatches];

  if(ordered.length===0){
    el.innerHTML = subTabsHtml + '<div class="empty">まだ参加者がいません。マイページから登録してください。</div>';
    return;
  }

  let html = '';
  ordered.forEach((name, i)=>{
    const s = computeStats(data.players[name]);
    const rankLabel = s.total>0 ? (i+1) : '–';
    const goalHtml = s.goalAchievement!==null
      ? `<div class="gauge-row"><span class="gauge-label">目標</span><div class="gauge"><div class="gauge-fill goal" style="width:${s.goalAchievement.toFixed(0)}%"></div></div><span class="gauge-val">${s.goalDone}/${s.goalTotal}</span></div>`
      : `<div class="gauge-row"><span class="gauge-label">目標</span><div class="gauge"><div class="gauge-fill goal" style="width:0%"></div></div><span class="gauge-val">未設定</span></div>`;
    html += `
      <div class="rank-card ${i===0 && s.total>0 ? 'r1':''}">
        <div class="rank-num">${rankLabel}</div>
        ${data.players[name].icon ? `<img class="member-icon" src="${data.players[name].icon}" alt="">` : `<div class="member-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>`}
        <div class="rank-body">
          <div class="rank-top">
            <span class="rank-name">${escapeHtml(name)}</span>
            <span class="rank-meta">${s.total}戦 ${s.wins}勝</span>
          </div>
          <div class="gauge-row">
            <span class="gauge-label">勝率</span>
            <div class="gauge"><div class="gauge-fill winrate" style="width:${s.winRate.toFixed(0)}%"></div></div>
            <span class="gauge-val">${s.winRate.toFixed(0)}%</span>
          </div>
          ${goalHtml}
          ${memberMetaChipsHtml(data.players[name])}
        </div>
      </div>`;
  });
  el.innerHTML = subTabsHtml + html;
}



function renderCurrentPage(){
  renderRanking();
}

(async function(){
  document.getElementById('view-ranking').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
