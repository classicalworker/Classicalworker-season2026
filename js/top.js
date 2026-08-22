// ===== TOPページ =====
// 各タブ(予定・目標・ランキング・メンバー)の最新情報や要点を
// ダッシュボード形式でまとめて表示する。データの読み書きは行わず、表示のみ。

// ---- NOW ON AIRバナー: サムネイル自動取得 + 目立つデザイン ----

function topExtractThumbnail(url){
  if(!isSafeHttpUrl(url)) return null;
  try{
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const pathParts = u.pathname.split('/').filter(Boolean);

    if(host === 'twitch.tv'){
      const channel = pathParts[0];
      if(channel) return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel.toLowerCase()}-440x248.jpg`;
    }
    if(host === 'youtube.com'){
      let vid = u.searchParams.get('v');
      if(!vid && (pathParts[0]==='live' || pathParts[0]==='embed' || pathParts[0]==='shorts')){
        vid = pathParts[1];
      }
      if(vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    }
    if(host === 'youtu.be'){
      const vid = pathParts[0];
      if(vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    }
  } catch(e){ /* URL解析に失敗した場合はサムネイルなし */ }
  return null;
}

function topThumbFallback(imgEl){
  const ph = document.createElement('div');
  ph.className = 'onair-item-thumb onair-item-thumb-ph';
  ph.textContent = '📡';
  imgEl.replaceWith(ph);
}

// 配信URLのプラットフォームを判定(YouTubeはタイトル自動取得に対応)
function topDetectPlatform(url){
  try{
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if(host === 'youtube.com' || host === 'youtu.be') return 'youtube';
    if(host === 'twitch.tv') return 'twitch';
  } catch(e){ /* noop */ }
  return null;
}

// YouTubeの公開oEmbed API(キー不要・CORS対応)から動画/配信タイトルを取得
// (手動でYouTube URLを入力したメンバー向け。閲覧者のブラウザから直接呼ぶため、
//  GitHub Actions側の自動検知で問題になっていたボット判定の影響を受けない)
async function topFetchYoutubeTitle(url){
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if(!res.ok) return null;
    const json = await res.json();
    return json && json.title ? json.title : null;
  } catch(e){
    return null;
  }
}

// 配信中メンバーの一覧を取得する。
// 優先順位: ① GitHub Actionsが自動検知した live_status(Twitchログイン名を登録している場合のみ。
//             YouTubeは仕様上の制約により自動検知非対応)
//          ② メンバーが手動で入力した配信URL+「配信中」チェック(YouTubeを含む①の対象外プラットフォーム用)
function topGetLiveEntries(){
  const names = Object.keys(data.players);
  const entries = [];
  names.forEach(n=>{
    const p = data.players[n];
    const auto = liveStatus && liveStatus[n];
    if (auto && auto.isLive && auto.url) {
      entries.push({
        name: n,
        url: auto.url,
        title: auto.title || '',
        platform: auto.platform || topDetectPlatform(auto.url),
        thumbnail: auto.thumbnail || '',
        auto: true
      });
    } else if (p.isLive && p.streamUrl) {
      entries.push({
        name: n,
        url: p.streamUrl,
        title: p.streamTitle || '',
        platform: topDetectPlatform(p.streamUrl),
        thumbnail: '',
        auto: false
      });
    }
  });
  return entries;
}

// バナー描画後に非同期でタイトルを取得し、該当スパンだけ更新する
// (自動検知分はタイトル取得済みなので対象外。手動入力のYouTube URLのみここでoEmbed取得する)
function topLoadOnAirTitles(){
  const entries = topGetLiveEntries();
  entries.forEach((entry, idx)=>{
    if (entry.auto || entry.platform !== 'youtube') return;
    topFetchYoutubeTitle(entry.url).then(title=>{
      const el = document.getElementById(`onair-title-${idx}`);
      if(!el) return;
      if(title){
        el.textContent = truncateZenkaku(title, 10);
        el.title = title;
        el.className = 'onair-item-stream-title';
      } else {
        const fallback = entry.title || '配信タイトルを取得できませんでした';
        el.textContent = truncateZenkaku(fallback, 10);
        el.title = fallback;
        el.className = 'onair-item-stream-title' + (entry.title ? '' : ' onair-item-stream-title-empty');
      }
    });
  });
}

function topOnAirBannerHtml(){
  const entries = topGetLiveEntries();
  if(entries.length===0) return '';

  const itemsHtml = entries.map((entry, idx)=>{
    const { name: n, url, platform, auto } = entry;
    // 自動検知分はyt-dlpが返した実際のサムネイルURLを優先し、無ければURLから推測する
    const thumb = entry.thumbnail || topExtractThumbnail(url);
    const thumbHtml = thumb
      ? `<img class="onair-item-thumb" src="${thumb}" alt="" loading="lazy" onerror="topThumbFallback(this)">`
      : `<div class="onair-item-thumb onair-item-thumb-ph">📡</div>`;
    // 自動検知分はタイトル取得済み、手動入力のYouTubeは取得中表示、それ以外は手入力タイトル(なければ「未設定」)を表示
    const initialTitle = auto
      ? (entry.title || '配信タイトルを取得できませんでした')
      : platform === 'youtube'
        ? 'タイトルを取得中...'
        : (entry.title || '配信タイトル未設定');
    const initialCls = auto
      ? 'onair-item-stream-title' + (entry.title ? '' : ' onair-item-stream-title-empty')
      : platform === 'youtube'
        ? 'onair-item-stream-title onair-item-stream-title-loading'
        : 'onair-item-stream-title' + (entry.title ? '' : ' onair-item-stream-title-empty');
    const titleHtml = `<span class="${initialCls}" id="onair-title-${idx}" title="${escapeHtml(initialTitle)}">${escapeHtml(truncateZenkaku(initialTitle, 10))}</span>`;
    const linkHtml = isSafeHttpUrl(url)
      ? `<a class="onair-item-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">見る</a>`
      : '';
    const autoBadge = auto ? `<span class="onair-item-auto-badge" title="自動検知">🔄自動</span>` : '';
    return `
      <div class="onair-item">
        ${thumbHtml}
        <div class="onair-item-info">
          <span class="onair-item-name">${escapeHtml(n)}${autoBadge}</span>
          ${titleHtml}
        </div>
        ${linkHtml}
      </div>`;
  }).join('');

  return `
    <div class="onair-banner">
      <div class="onair-banner-head">
        <span class="onair-dot"></span>
        <span class="onair-label">NOW ON AIR</span>
      </div>
      <div class="onair-list">${itemsHtml}</div>
    </div>`;
}

// ---- 予定カード: 直近の予定の出席確認サマリー + ミニカレンダー ----

function topGetEventsByDate(){
  const map = {};
  (data.events||[]).forEach(ev=>{
    (ev.dates||[]).forEach(d=>{ (map[d] = map[d] || []).push(ev); });
  });
  (data.tournaments||[]).forEach(t=>{
    (t.dates||[]).forEach(d=>{ (map[d] = map[d] || []).push(t); });
  });
  return map;
}

function topGetAttendanceEvents(){
  return (data.events||[])
    .filter(ev=>!isEventFullyPast(ev) && ev.attendanceRequired)
    .slice()
    .sort((a,b)=> (a.dates[0]||'').localeCompare(b.dates[0]||''));
}

// 1つの予定に複数日ある場合、日付ごとに別々の出席入力として展開する(例: 9/7,9/17 → 2件表示)
function topGetAttendanceDayEntries(){
  const events = topGetAttendanceEvents();
  const entries = [];
  events.forEach(ev=>{
    const dates = (ev.dates||[]).slice().sort();
    dates.forEach(day=>{
      entries.push({ ev, day });
    });
  });
  entries.sort((a,b)=> a.day.localeCompare(b.day));
  return entries;
}

// TOP画面から直接出席を入力できるようにする(全予定を1列表示・件数が多い場合はページめくり)
function topSetCurrentPlayer(v){
  currentPlayer = v || null;
  renderTop();
}

async function topSetAttendance(eventId, day, status){
  if(!currentPlayer){ showToast('先に「あなたは」を選択してください'); return; }
  const ev = (data.events||[]).find(e=>e.id===eventId);
  if(!ev) return;
  if(!ev.attendance) ev.attendance = {};
  if(!ev.attendance[day]) ev.attendance[day] = {};
  ev.attendance[day][currentPlayer] = status;
  await saveData();
  renderTop();
  showToast('出席を更新しました');
}

const TOP_ATTEND_EVENTS_PER_PAGE = 2; // 1ページに表示する件数(高さを保つため)
let topAttendPage = 0;

function topChangeAttendPage(delta){
  topAttendPage += delta;
  renderTop();
}

function topAttendanceDayCardHtml(entry, totalMembers){
  const { ev, day } = entry;
  const dateLabel = formatDayShort(day);

  const dayAtt = (ev.attendance && ev.attendance[day]) || {};
  const values = Object.values(dayAtt);
  const yes = values.filter(s=>s==='yes').length;
  const maybe = values.filter(s=>s==='maybe').length;
  const no = values.filter(s=>s==='no').length;
  const pending = Math.max(totalMembers - yes - maybe - no, 0);
  const mine = currentPlayer ? dayAtt[currentPlayer] : null;

  return `
    <div class="top-attend-event">
      <div class="top-sched-next">
        <span class="top-sched-badge">${escapeHtml(dateLabel)}</span>
        <span class="top-sched-title">${escapeHtml(ev.title)}</span>
      </div>
      <div class="top-attend-summary">
        <div class="top-attend-chip yes">○ 出席 ${yes}</div>
        <div class="top-attend-chip maybe">△ 未定 ${maybe}</div>
        <div class="top-attend-chip no">× 欠席 ${no}</div>
        <div class="top-attend-chip pending">？ 未回答 ${pending}</div>
      </div>
      <div class="attend-buttons">
        <div class="attend-btn yes ${mine==='yes'?'selected':''}" onclick="topSetAttendance('${ev.id}','${day}','yes')">出席</div>
        <div class="attend-btn maybe ${mine==='maybe'?'selected':''}" onclick="topSetAttendance('${ev.id}','${day}','maybe')">未定</div>
        <div class="attend-btn no ${mine==='no'?'selected':''}" onclick="topSetAttendance('${ev.id}','${day}','no')">欠席</div>
      </div>
    </div>`;
}

function topAttendanceEventsHtml(){
  const entries = topGetAttendanceDayEntries();

  if(entries.length===0){
    const hasAnyUpcoming = (data.events||[]).some(ev=>!isEventFullyPast(ev));
    const msg = hasAnyUpcoming
      ? '出席確認が必要な予定は今のところありません'
      : '直近の予定はまだ登録されていません';
    return `
      <div class="top-attend-input">
        <div class="top-attend-input-head">📋 出席の入力</div>
        <div class="top-sched-empty">${msg}</div>
      </div>`;
  }

  const totalMembers = Object.keys(data.players).length;
  const names = Object.keys(data.players);
  const whoamiOptions = names.map(n=>`<option value="${escapeHtml(n)}" ${currentPlayer===n?'selected':''}>${escapeHtml(n)}</option>`).join('');

  const perPage = TOP_ATTEND_EVENTS_PER_PAGE;
  const totalPages = Math.max(Math.ceil(entries.length / perPage), 1);
  if(topAttendPage >= totalPages) topAttendPage = totalPages - 1;
  if(topAttendPage < 0) topAttendPage = 0;

  const pageEntries = entries.slice(topAttendPage*perPage, topAttendPage*perPage + perPage);
  const cardsHtml = pageEntries.map(entry=>topAttendanceDayCardHtml(entry, totalMembers)).join('');

  const pagerHtml = totalPages>1 ? `
    <div class="top-attend-pager">
      <button type="button" class="mini-cal-pager-btn" onclick="topChangeAttendPage(-1)" ${topAttendPage===0?'disabled':''}>◀</button>
      <span class="mini-cal-pager-label">${topAttendPage+1} / ${totalPages}</span>
      <button type="button" class="mini-cal-pager-btn" onclick="topChangeAttendPage(1)" ${topAttendPage===totalPages-1?'disabled':''}>▶</button>
    </div>` : '';

  return `
    <div class="top-attend-input">
      <div class="top-attend-input-head">📋 出席の入力(${entries.length}件)</div>
      <div class="whoami top-attend-whoami">
        <label style="margin:0">あなたは:</label>
        <select onchange="topSetCurrentPlayer(this.value)">
          <option value="">選択してください</option>${whoamiOptions}
        </select>
      </div>
      <div class="top-attend-event-list">${cardsHtml}</div>
      ${pagerHtml}
    </div>`;
}

// ミニカレンダー: 月表示(1〜31)。前後の月はページめくりで切り替える
let topMiniCalYear = null;
let topMiniCalMonth = null;

function topChangeMiniCalMonth(delta){
  if(topMiniCalYear===null){
    const today = new Date();
    topMiniCalYear = today.getFullYear();
    topMiniCalMonth = today.getMonth();
  }
  topMiniCalMonth += delta;
  if(topMiniCalMonth < 0){ topMiniCalMonth = 11; topMiniCalYear--; }
  if(topMiniCalMonth > 11){ topMiniCalMonth = 0; topMiniCalYear++; }
  renderTop();
}

function topMiniCalendarHtml(){
  const eventsByDate = topGetEventsByDate();
  const today = new Date();
  if(topMiniCalYear===null){
    topMiniCalYear = today.getFullYear();
    topMiniCalMonth = today.getMonth();
  }
  const year = topMiniCalYear, month = topMiniCalMonth;
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = today.toISOString().slice(0,10);

  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  const weekdayNames = ['日','月','火','水','木','金','土'];
  const headerHtml = weekdayNames.map((w,i)=>`<div class="mini-cal-weekday ${i===0?'sun':''} ${i===6?'sat':''}">${w}</div>`).join('');

  const cellsHtml = cells.map((d,i)=>{
    if(d===null) return `<div class="mini-cal-cell empty"></div>`;
    const col = i % 7;
    const dateStr = `${year}-${pad2(month+1)}-${pad2(d)}`;
    const evs = eventsByDate[dateStr] || [];
    const has = evs.length > 0;
    const isToday = dateStr === todayStr;
    const clickAttr = has ? ` onclick="location.href='schedule.html?openDate=${dateStr}'"` : '';
    const shown = evs.slice(0,2).map(ev=>`<div class="mini-cal-event-label" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`).join('');
    const more = evs.length>2 ? `<div class="mini-cal-event-more">+${evs.length-2}件</div>` : '';
    return `<div class="mini-cal-cell ${isToday?'today':''} ${has?'has-event':''} ${col===0?'sun-col':''} ${col===6?'sat-col':''}"${clickAttr}>
      <span class="mini-cal-daynum">${d}</span>${shown}${more}
    </div>`;
  }).join('');

  return `
    <div class="mini-cal-nav">
      <button type="button" class="mini-cal-pager-btn" onclick="topChangeMiniCalMonth(-1)">◀</button>
      <span class="mini-cal-head">${year}年${month+1}月</span>
      <button type="button" class="mini-cal-pager-btn" onclick="topChangeMiniCalMonth(1)">▶</button>
    </div>
    <div class="mini-cal-grid">${headerHtml}${cellsHtml}</div>`;
}

function topScheduleCardHtml(){
  return `
    <div class="mini-cal">${topMiniCalendarHtml()}</div>
    ${topAttendanceEventsHtml()}`;
}

// ---- 目標カード: ランダムで3人の「取組中」ミッションを表示 ----
// (出席入力やページ送りなどで再描画されるたびにシャッフルし直さないよう、選出結果をキャッシュする)

function topShuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function topPlayerMission(name){
  const p = data.players[name];
  const goals = p.goals || [];
  const activeGoal = goals.find(g=>!g.done);
  if(activeGoal) return {text: activeGoal.text, done: false};
  if(p.mainGoal) return {text: p.mainGoal, done: !!p.mainGoalDone};
  return null;
}

let topCachedMissionNames = null;

function topGoalsCardHtml(){
  const names = Object.keys(data.players);
  const withMission = names.filter(n => topPlayerMission(n));
  if(withMission.length===0){
    topCachedMissionNames = null;
    return `<div class="top-card-empty-msg">まだミッションが設定されていません。</div>`;
  }
  // キャッシュが無効(初回描画、または選出済みメンバーが対象から外れた)場合のみ再抽選する
  if(!topCachedMissionNames || !topCachedMissionNames.every(n => withMission.includes(n))){
    topCachedMissionNames = topShuffle(withMission).slice(0,3);
  }
  const picked = topCachedMissionNames;
  const itemsHtml = picked.map(n=>{
    const p = data.players[n];
    const m = topPlayerMission(n);
    const iconHtml = p.icon
      ? `<img class="mission-icon" src="${p.icon}" alt="">`
      : `<div class="mission-icon-ph">👤</div>`;
    const statusHtml = m.done
      ? `<span class="mission-status done">✅ 達成済み</span>`
      : `<span class="mission-status active">🔥 取組中</span>`;
    return `
      <div class="mission-item">
        ${iconHtml}
        <div class="mission-body">
          <div class="mission-name">${escapeHtml(n)}</div>
          <div class="mission-text">${escapeHtml(m.text)}</div>
          ${statusHtml}
        </div>
      </div>`;
  }).join('');
  return `<div class="mission-list">${itemsHtml}</div>`;
}

// ---- ランキングカード: 勝率3位まで表示 ----

function topRankingCardHtml(){
  const names = Object.keys(data.players);
  const withMatches = names
    .map(n => ({name:n, stats: computeStats(data.players[n])}))
    .filter(p => p.stats.total > 0)
    .sort((a,b)=> b.stats.winRate - a.stats.winRate || b.stats.wins - a.stats.wins);

  if(withMatches.length===0){
    return `<div class="top-card-empty-msg">まだ対戦成績が記録されていません。</div>`;
  }

  const medals = ['🥇','🥈','🥉'];
  const itemsHtml = withMatches.slice(0,3).map((p,i)=>{
    const player = data.players[p.name];
    const iconHtml = player.icon
      ? `<img class="top-rank-icon" src="${player.icon}" alt="">`
      : `<div class="top-rank-icon-ph">👤</div>`;
    return `
      <div class="top-rank-item rank${i+1}">
        <span class="top-rank-medal">${medals[i]}</span>
        ${iconHtml}
        <div class="top-rank-body">
          <span class="top-rank-name">${escapeHtml(p.name)}</span>
          <span class="top-rank-rate">勝率 ${p.stats.winRate.toFixed(0)}% (${p.stats.total}戦${p.stats.wins}勝)</span>
        </div>
      </div>`;
  }).join('');
  return `<div class="top-rank-list">${itemsHtml}</div>`;
}

// ---- メンバーカード: ランダムで3人をピックアップ表示 ----
// (再描画のたびにシャッフルし直さないよう、選出結果をキャッシュする)

let topCachedMemberNames = null;

function topMembersCardHtml(){
  const names = Object.keys(data.players);
  if(names.length===0){
    topCachedMemberNames = null;
    return `<div class="top-card-empty-msg">まだ参加者がいません。マイページから登録してください。</div>`;
  }
  if(!topCachedMemberNames || !topCachedMemberNames.every(n => names.includes(n))){
    topCachedMemberNames = topShuffle(names).slice(0,3);
  }
  const picked = topCachedMemberNames;
  const itemsHtml = picked.map(n=>{
    const p = data.players[n];
    const s = computeStats(p);
    const iconHtml = p.icon
      ? `<img class="top-spotlight-icon" src="${p.icon}" alt="">`
      : `<div class="top-spotlight-icon-ph">👤</div>`;
    return `
      <div class="top-spotlight-item">
        ${iconHtml}
        <div class="top-spotlight-body">
          <div class="top-spotlight-top">
            <span class="top-spotlight-name">${escapeHtml(n)}</span>
            ${p.maxMR ? `<span class="top-spotlight-mr">MR ${escapeHtml(p.maxMR)}</span>` : ''}
          </div>
          <div class="top-spotlight-record">${s.total}戦 ${s.wins}勝</div>
        </div>
      </div>`;
  }).join('');
  return `<div class="top-spotlight-list">${itemsHtml}</div>
    <div class="top-member-count">登録メンバー数: <span class="top-card-highlight">${names.length}名</span></div>`;
}

function renderTop(){
  const el = document.getElementById('view-top');
  el.innerHTML = `
    ${topOnAirBannerHtml()}
    <div class="top-dashboard">

      <div class="top-card top-card--schedule">
        <div class="top-card-head">
          <div class="top-card-title">📅 予定</div>
          <a class="top-link-btn" href="schedule.html">見る</a>
        </div>
        <div class="top-card-body top-card-body--schedule">
          ${topScheduleCardHtml()}
        </div>
      </div>

      <div class="top-card top-card--goals">
        <div class="top-card-head">
          <div class="top-card-title">📝 本日の課題<span class="top-card-title-note">(ランダムに表示中)</span></div>
          <a class="top-link-btn" href="goals.html">見る</a>
        </div>
        <div class="top-card-body">
          ${topGoalsCardHtml()}
        </div>
      </div>

      <div class="top-card top-card--ranking">
        <div class="top-card-head">
          <div class="top-card-title">🏆 ランキング</div>
          <a class="top-link-btn" href="ranking.html">見る</a>
        </div>
        <div class="top-card-body">
          ${topRankingCardHtml()}
        </div>
      </div>

      <div class="top-card top-card--members">
        <div class="top-card-head">
          <div class="top-card-title">👥 メンバー<span class="top-card-title-note">(ランダムに表示中)</span></div>
          <a class="top-link-btn" href="members.html">見る</a>
        </div>
        <div class="top-card-body">
          ${topMembersCardHtml()}
        </div>
      </div>

    </div>
  `;
  // NOW ON AIRのタイトルはYouTubeのみ非同期で自動取得し、後から該当箇所を更新する
  topLoadOnAirTitles();
}

// このページの再描画エントリポイント(Firebaseからの更新反映・初期表示で使用)
function renderCurrentPage(){
  renderTop();
}

(async function(){
  document.getElementById('view-top').innerHTML = '<div class="empty">読み込み中...</div>';
  await Promise.all([initPage(), loadLiveStatus()]);
  renderTop();
  // 5〜10分おきにGitHub Actionsが更新するデータなので、リアルタイムリスナーで自動反映する
  setupLiveStatusListener(renderTop);
})();
