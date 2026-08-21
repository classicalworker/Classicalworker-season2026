function renderGoalsOverview(){
  const el = document.getElementById('view-goals');
  const names = Object.keys(data.players);
  if(names.length===0){
    el.innerHTML = '<div class="empty">まだ参加者がいません。マイページから登録してください。</div>';
    return;
  }
  const achievers = names.filter(n => data.players[n].mainGoal && data.players[n].mainGoalDone);
  let bannerHtml = '';
  if(achievers.length>0){
    bannerHtml = `<div class="achievement-banner">
      ${achievers.map(n=>`
        <div class="achievement-item">
          <div class="achievement-name">🎉 ${escapeHtml(n)}さんが目標を達成しました!!</div>
          <div class="achievement-goal">${escapeHtml(data.players[n].mainGoal)}</div>
        </div>`).join('')}
    </div>`;
  }

  const sorted = names.slice().sort((a,b)=>{
    const sa = computeStats(data.players[a]), sb = computeStats(data.players[b]);
    const aRate = sa.goalAchievement ?? -1, bRate = sb.goalAchievement ?? -1;
    return bRate - aRate;
  });
  let html = sorted.map(name=>{
    const p = data.players[name];
    const s = computeStats(p);
    const controlLabel = (p.controlTypes||[]).join('/') || '未設定';
    const mainGoalHtml = p.mainGoal
      ? `<div class="main-goal">${p.mainGoalDone?'✅':'🎯'} ${escapeHtml(p.mainGoal)}${p.mainGoalDone?' <span style="font-family:var(--font-mono);font-size:10px;color:var(--win)">達成済み</span>':''}</div>`
      : `<div class="main-goal empty-goal">目標は未設定です</div>`;
    const goals = p.goals || [];
    const chips = goals.slice(0,8).map(g=>`<span class="subgoal-chip ${g.done?'done':''}">${escapeHtml(g.text)}</span>`).join('');
    const more = goals.length>8 ? `<span class="subgoal-chip">+${goals.length-8}</span>` : '';
    return `
      <div class="goal-card">
        <div class="goal-card-top">
          <span class="goal-card-name">${escapeHtml(name)}</span>
          <span class="goal-card-chars">操作:${escapeHtml(controlLabel)} ${p.maxMR ? 'MR:'+escapeHtml(p.maxMR) : ''}</span>
        </div>
        ${mainGoalHtml}
        <div class="mission-rate-block">
          <div class="mission-rate-label">
            <span>ミッション達成率</span>
            <span class="mission-rate-value">${s.goalAchievement!==null?s.goalDone+'/'+s.goalTotal:'–'}</span>
          </div>
          <div class="gauge"><div class="gauge-fill goal" style="width:${s.goalAchievement!==null?s.goalAchievement.toFixed(0):0}%"></div></div>
        </div>
        <div class="subgoal-chips">${chips}${more}</div>
      </div>`;
  }).join('');
  el.innerHTML = bannerHtml + html;
}


function renderCurrentPage(){
  renderGoalsOverview();
}

(async function(){
  document.getElementById('view-goals').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
