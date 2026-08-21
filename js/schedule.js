function genDateRange(start, end){
  const startD = new Date(start + 'T00:00:00');
  if(isNaN(startD.getTime())) return [start];
  const endD = new Date((end || start) + 'T00:00:00');
  if(isNaN(endD.getTime()) || endD < startD) return [start];
  const days = [];
  let d = startD;
  let count = 0;
  while(d <= endD && count < 60){
    days.push(d.toISOString().slice(0,10));
    d = new Date(d.getTime() + 86400000);
    count++;
  }
  return days;
}

function getEventsByDate(){
  const map = {};
  (data.events||[]).forEach(ev=>{
    (ev.dates||[]).forEach(d=>{
      if(!map[d]) map[d] = [];
      map[d].push(Object.assign({itemType:'event'}, ev));
    });
  });
  (data.tournaments||[]).forEach(t=>{
    (t.dates||[]).forEach(d=>{
      if(!map[d]) map[d] = [];
      map[d].push(Object.assign({itemType:'tournament'}, t));
    });
  });
  return map;
}


function datesAreContiguousRange(dates){
  if(dates.length<2) return false;
  const full = genDateRange(dates[0], dates[dates.length-1]);
  return full.length===dates.length && full.every((d,i)=>d===dates[i]);
}

function changeCalendarMonth(delta){
  calendarMonth += delta;
  if(calendarMonth<0){ calendarMonth=11; calendarYear--; }
  if(calendarMonth>11){ calendarMonth=0; calendarYear++; }
  renderSchedule();
}

function renderCalendarMonth(){
  const eventsByDate = getEventsByDate();
  const year = calendarYear, month = calendarMonth;
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);

  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  const weekdayNames = ['日','月','火','水','木','金','土'];
  const headerHtml = weekdayNames.map((w,i)=>`<div class="cal-weekday ${i===0?'sun':''} ${i===6?'sat':''}">${w}</div>`).join('');

  const cellsHtml = cells.map((d, i)=>{
    if(d===null) return `<div class="cal-cell empty"></div>`;
    const col = i % 7;
    const dateStr = `${year}-${pad2(month+1)}-${pad2(d)}`;
    const evs = eventsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const shown = evs.slice(0,2).map(ev=>`<div class="cal-event-label" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`).join('');
    const more = evs.length>2 ? `<div class="cal-event-more">+${evs.length-2}件</div>` : '';
    const clickAttr = evs.length ? ` onclick="openDayModal('${dateStr}')" style="cursor:pointer"` : '';
    return `<div class="cal-cell ${isToday?'today':''} ${evs.length?'has-event':''} ${col===0?'sun-col':''} ${col===6?'sat-col':''}"${clickAttr}>
      <div class="cal-daynum">${d}</div>
      ${shown}${more}
    </div>`;
  }).join('');

  return `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="changeCalendarMonth(-1)">◀</button>
      <div class="cal-nav-label">${year}年 ${month+1}月</div>
      <button class="cal-nav-btn" onclick="changeCalendarMonth(1)">▶</button>
    </div>
    <div class="cal-legend"><span class="swatch"></span>予定のある日</div>
    <div class="cal-grid">${headerHtml}${cellsHtml}</div>`;
}

function renderSchedule(){
  const el = document.getElementById('view-schedule');
  const names = Object.keys(data.players);

  // 「あなたは」が選択できるよう修正(currentPlayerを反映)
  const whoamiOptions = names.map(n=>`<option value="${escapeHtml(n)}" ${currentPlayer===n?'selected':''}>${escapeHtml(n)}</option>`).join('');
  const upcoming = (data.events||[]).filter(ev=>!isEventFullyPast(ev)).slice().sort((a,b)=> (a.dates[0]||'').localeCompare(b.dates[0]||''));
  const eventsHtml = upcoming.length>0 ? upcoming.map(ev=>eventCardHtml(ev)).join('') : '<div class="empty">予定はまだありません</div>';

  const calendarHtml = renderCalendarMonth();

  const past = (data.tournaments||[]).slice().sort((a,b)=> (b.dates[0]||'').localeCompare(a.dates[0]||''));
  const pastShown = past.slice(0,5);
  const tournamentsHtml = past.length>0 ? pastShown.map(t=>tournamentCardHtml(t)).join('') : '<div class="empty">過去の大会記録はまだありません</div>';
  const pastMoreHint = past.length>5 ? `<div class="attend-toggle-hint">他 ${past.length-5}件は、カレンダーの日付から確認できます。</div>` : '';

  el.innerHTML = `
    <div class="notice-section-title">📅 予定管理</div>
    <div style="background:rgba(232,178,61,0.08);border:1px solid var(--panel-border);border-radius:10px;padding:14px;margin-bottom:16px;">
      <div style="font-size:13px;color:var(--text);margin-bottom:8px;">📌 予定を追加して、メンバーの出席を確認しましょう</div>
      <button class="add-open-btn" onclick="openEventModal()" style="margin:0;">＋ 新しい予定を追加</button>
    </div>

    <div class="whoami">
      <label style="margin:0">あなたは:</label>
      <select onchange="setSchedulePlayer(this.value)">
        <option value="">選択してください</option>${whoamiOptions}
      </select>
    </div>
    ${eventsHtml}

    <div class="notice-section-title">📅 カレンダー</div>
    ${calendarHtml}
    <div class="attend-toggle-hint">日付をタップすると、その日の予定を確認・出席登録できます。</div>

    <div class="notice-section-title">🏆 過去の大会情報・大会記録</div>
    ${tournamentsHtml}
    ${pastMoreHint}
    <button class="add-open-btn" onclick="openTournamentModal()">＋ 大会記録を追加</button>`;
}

function eventCardHtml(ev, onlyDay){
  const isEditing = editingEventId === ev.id;
  const dates = (ev.dates||[]).slice().sort();
  const badge = formatDateBadge(dates[0]);
  let rangeLabel = '';
  if(dates.length>1){
    rangeLabel = datesAreContiguousRange(dates)
      ? `${formatDayShort(dates[0])} 〜 ${formatDayShort(dates[dates.length-1])}(${dates.length}日間)`
      : `${dates.map(formatDayShort).join('・')}(${dates.length}日間)`;
  }
  const attendTag = ev.attendanceRequired
    ? ''
    : `<span class="pill" style="background:rgba(139,137,154,.18);color:var(--text-dim);margin-left:6px">出席確認なし</span>`;
  const todayStr = new Date().toISOString().slice(0,10);
  const deadlinePassed = !!(ev.attendanceRequired && ev.attendanceDeadline && todayStr > ev.attendanceDeadline);
  const deadlineTag = (ev.attendanceRequired && ev.attendanceDeadline)
    ? `<span class="deadline-badge ${deadlinePassed?'passed':''}">${deadlinePassed?'⚠️ 出席期限切れ':'⏰ 出席期限'} ${formatDayShort(ev.attendanceDeadline)}</span>`
    : '';
  const daysToShow = onlyDay ? dates.filter(d=>d===onlyDay) : dates;

  if(isEditing){
    return `
      <div class="event-card editing">
        <div class="edit-fields">
          <div class="edit-row">
            <div>
              <label>タイトル</label>
              <input type="text" id="edit-event-title-${ev.id}" value="${escapeHtml(ev.title)}">
            </div>
            <div>
              <label>出席確認</label>
              <select id="edit-event-attend-${ev.id}">
                <option value="true" ${ev.attendanceRequired?'selected':''}>有</option>
                <option value="false" ${!ev.attendanceRequired?'selected':''}>無</option>
              </select>
            </div>
          </div>
          <div>
            <label>詳細</label>
            <textarea id="edit-event-desc-${ev.id}">${escapeHtml(ev.description||'')}</textarea>
          </div>
          ${ev.attendanceRequired ? `
          <div>
            <label>出席確認の期限日(任意)</label>
            <input type="date" id="edit-event-deadline-${ev.id}" value="${escapeHtml(ev.attendanceDeadline||'')}">
          </div>
          ` : ''}
          <div class="edit-actions">
            <button class="primary" onclick="saveEventEdit('${ev.id}')">保存</button>
            <button class="ghost" onclick="cancelEventEdit()">キャンセル</button>
          </div>
        </div>
      </div>
    `;
  }

  let dayRowsHtml = '';
  if(ev.attendanceRequired){
    dayRowsHtml = daysToShow.map(day=>{
      const dayAtt = (ev.attendance && ev.attendance[day]) || {};
      const mine = currentPlayer ? dayAtt[currentPlayer] : null;
      const groups = {yes:[], maybe:[], no:[]};
      Object.entries(dayAtt).forEach(([n,st])=>{ if(groups[st]) groups[st].push(n); });
      const chipRow = (label, list, cls) => `
        <div class="attend-breakdown-row">
          <span class="attend-breakdown-label">${label}</span>
          <span class="attend-breakdown-names">${list.length ? list.map(n=>`<span class="name-chip ${cls}">${escapeHtml(n)}</span>`).join('') : '<span class="attend-breakdown-empty">–</span>'}</span>
        </div>`;
      return `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--panel-border)">
          ${dates.length>1 ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--gold);margin-bottom:6px">${formatDayShort(day)}</div>` : ''}
          <div class="attend-buttons">
            <div class="attend-btn yes ${mine==='yes'?'selected':''}" onclick="setAttendance('${ev.id}','${day}','yes')">出席</div>
            <div class="attend-btn maybe ${mine==='maybe'?'selected':''}" onclick="setAttendance('${ev.id}','${day}','maybe')">未定</div>
            <div class="attend-btn no ${mine==='no'?'selected':''}" onclick="setAttendance('${ev.id}','${day}','no')">欠席</div>
          </div>
          <div class="attend-breakdown">
            ${chipRow('出席', groups.yes, 'yes')}
            ${chipRow('未定', groups.maybe, 'maybe')}
            ${chipRow('欠席', groups.no, 'no')}
          </div>
        </div>`;
    }).join('');
  }

  return `
    <div class="event-card">
      <div class="event-top">
        <div class="event-date-badge"><div class="d">${badge.d}</div><div class="m">${badge.m}</div></div>
        <div style="flex:1">
          <div class="event-title">${escapeHtml(ev.title)}${attendTag}</div>
          ${deadlineTag ? `<div style="margin-top:4px">${deadlineTag}</div>` : ''}
          ${rangeLabel ? `<div class="event-desc" style="color:var(--gold)">${rangeLabel}</div>` : ''}
          ${ev.description ? `<div class="event-desc">${escapeHtml(ev.description)}</div>` : ''}
        </div>
        <div class="event-actions">
          <button class="edit-btn" onclick="startEditEvent('${ev.id}')">✎ 編集</button>
          <button class="ghost" onclick="deleteEvent('${ev.id}')">削除</button>
        </div>
      </div>
      ${dayRowsHtml}
    </div>`;
}

function tournamentCardHtml(t){
  const dates = (t.dates||[]).slice().sort();
  const dateLabel = dates.length>1
    ? (datesAreContiguousRange(dates)
        ? `${dates[0]} 〜 ${dates[dates.length-1]}(${dates.length}日間)`
        : dates.join('・'))
    : (dates[0] || '日付未設定');
  return `
    <div class="tournament-card">
      <div class="tournament-title">${escapeHtml(t.title)}</div>
      <div class="tournament-date">${escapeHtml(dateLabel)}</div>
      ${t.description ? `<div class="tournament-desc" style="white-space:pre-wrap">${escapeHtml(t.description)}</div>` : ''}
      ${t.result ? `<div class="tournament-result">🏅 ${escapeHtml(t.result)}</div>` : ''}
      <div style="text-align:right;margin-top:8px;display:flex;justify-content:flex-end;gap:8px">
        <button class="edit-btn" onclick="openTournamentModal('${t.id}')">✎ 編集</button>
        <button class="ghost" onclick="deleteTournament('${t.id}')">削除</button>
      </div>
    </div>`;
}

function startEditEvent(id){
  editingEventId = id;
  // 編集モードに入ったら詳細モーダルを閉じる
  closeModal();
  renderSchedule();
}

function cancelEventEdit(){
  editingEventId = null;
  renderSchedule();
}

async function saveEventEdit(id){
  const ev = data.events.find(e=>e.id===id);
  if(!ev) return;
  const title = document.getElementById('edit-event-title-'+id).value.trim();
  const desc = document.getElementById('edit-event-desc-'+id).value.trim();
  const attendRequired = document.getElementById('edit-event-attend-'+id).value === 'true';
  const deadlineEl = document.getElementById('edit-event-deadline-'+id);
  if(!title){ showToast('タイトルを入力してください'); return; }
  ev.title = title;
  ev.description = desc;
  ev.attendanceRequired = attendRequired;
  ev.attendanceDeadline = attendRequired && deadlineEl ? (deadlineEl.value || null) : null;
  editingEventId = null;
  await saveData();
  renderSchedule();
  showToast('更新しました');
}

function openDayModal(dateStr){
  const items = (getEventsByDate()[dateStr]) || [];
  const badge = formatDateBadge(dateStr);
  const bodyHtml = items.length
    ? items.map(item => item.itemType==='tournament' ? tournamentCardHtml(item) : eventCardHtml(item, dateStr)).join('')
    : '<div class="empty">この日の予定はありません</div>';
  openModal(`
    <div class="modal-head">
      <h2>${badge.m} ${badge.d}日 の予定</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    ${bodyHtml}
  `);
  document.getElementById('modal-box').dataset.dayModal = dateStr;
}

function setSchedulePlayer(v){
  currentPlayer = v || null;
  renderSchedule();
}

async function deleteEvent(id){
  if(!confirm('この予定を削除しますか？')) return;
  data.events = data.events.filter(e=>e.id!==id);
  editingEventId = null;
  await saveData();
  closeModal();
  renderSchedule();
  showToast('削除しました');
}

async function setAttendance(eventId, day, status){
  if(!currentPlayer){ showToast('先に「あなたは」を選択してください'); return; }
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;
  if(!ev.attendance) ev.attendance = {};
  if(!ev.attendance[day]) ev.attendance[day] = {};
  ev.attendance[day][currentPlayer] = status;
  await saveData();
  renderSchedule();
  if(document.getElementById('modal-overlay').style.display !== 'none' && document.getElementById('modal-box').dataset.dayModal === day){
    openDayModal(day);
  }
}

async function deleteTournament(id){
  data.tournaments = data.tournaments.filter(t=>t.id!==id);
  await saveData();
  renderSchedule();
}

function pickerInit(initialDates){
  picker = { dates: new Set(initialDates||[]), year: _today.getFullYear(), month: _today.getMonth() };
  if(initialDates && initialDates.length){
    const d = new Date(initialDates[0]+'T00:00:00');
    if(!isNaN(d.getTime())){ picker.year = d.getFullYear(); picker.month = d.getMonth(); }
  }
}

function pickerChangeMonth(delta, renderFn){
  picker.month += delta;
  if(picker.month<0){ picker.month=11; picker.year--; }
  if(picker.month>11){ picker.month=0; picker.year++; }
  window[renderFn]();
}

function pickerToggleDate(dateStr, renderFn){
  if(picker.dates.has(dateStr)) picker.dates.delete(dateStr);
  else picker.dates.add(dateStr);
  window[renderFn]();
}

function pickerApplyRange(startId, endId, renderFn){
  const start = document.getElementById(startId).value;
  const endRaw = document.getElementById(endId).value;
  if(!start){ showToast('開始日を選択してください'); return; }
  const end = endRaw || start;
  if(end < start){ showToast('終了日は開始日より後にしてください'); return; }
  genDateRange(start, end).forEach(d=>picker.dates.add(d));
  window[renderFn]();
}

function pickerClear(renderFn){
  picker.dates.clear();
  window[renderFn]();
}

function pickerCalendarHtml(onClickFnName){
  const year = picker.year, month = picker.month;
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  const weekdayNames = ['日','月','火','水','木','金','土'];
  const headerHtml = weekdayNames.map(w=>`<div class="picker-weekday">${w}</div>`).join('');
  const cellsHtml = cells.map(d=>{
    if(d===null) return `<div class="picker-cell empty"></div>`;
    const dateStr = `${year}-${pad2(month+1)}-${pad2(d)}`;
    const isToday = dateStr===todayStr;
    const isSelected = picker.dates.has(dateStr);
    return `<div class="picker-cell ${isSelected?'selected':''} ${isToday?'today':''}" onclick="${onClickFnName}('${dateStr}')">${d}</div>`;
  }).join('');
  const sortedDates = Array.from(picker.dates).sort();
  const summaryHtml = sortedDates.length
    ? `<span>選択中: ${sortedDates.map(formatDayShort).join('・')}</span><button class="picker-clear" onclick="${onClickFnName==='eventModalToggleDate'?'eventModalClear':'tournamentModalClear'}()">すべて解除</button>`
    : `<span>まだ日付が選択されていません</span>`;
  return `
    <div class="picker-cal">
      <div class="picker-cal-nav">
        <button type="button" class="picker-cal-btn" onclick="${onClickFnName==='eventModalToggleDate'?'eventModalChangeMonth(-1)':'tournamentModalChangeMonth(-1)'}">◀</button>
        <div class="picker-cal-label">${year}年 ${month+1}月</div>
        <button type="button" class="picker-cal-btn" onclick="${onClickFnName==='eventModalToggleDate'?'eventModalChangeMonth(1)':'tournamentModalChangeMonth(1)'}">▶</button>
      </div>
      <div class="picker-grid">${headerHtml}${cellsHtml}</div>
      <div class="picker-selected-summary">${summaryHtml}</div>
    </div>`;
}

let eventModalAttendanceRequired = true;
let eventModalTitle = '';
let eventModalDesc = '';
let eventModalDeadline = '';

function openEventModal(){
  eventModalAttendanceRequired = true;
  eventModalTitle = '';
  eventModalDesc = '';
  eventModalDeadline = '';
  pickerInit([]);
  renderEventModal();
  document.getElementById('modal-overlay').style.display = 'flex';
}
function eventModalChangeMonth(delta){ eventModalSyncInputs(); pickerChangeMonth(delta, 'renderEventModal'); }
function eventModalSyncInputs(){
  const titleEl = document.getElementById('event-title-input');
  const descEl = document.getElementById('event-desc-input');
  const deadlineEl = document.getElementById('event-deadline-input');
  if(titleEl) eventModalTitle = titleEl.value;
  if(descEl) eventModalDesc = descEl.value;
  if(deadlineEl) eventModalDeadline = deadlineEl.value;
}
function eventModalToggleDate(d){ 
  eventModalSyncInputs();
  pickerToggleDate(d, 'renderEventModal');
}
function eventModalClear(){ 
  eventModalSyncInputs();
  pickerClear('renderEventModal');
}
function eventModalApplyRange(){ 
  eventModalSyncInputs();
  pickerApplyRange('event-range-start','event-range-end','renderEventModal');
}
function eventModalSetAttendance(v){
  eventModalAttendanceRequired = v;
  eventModalSyncInputs();
  renderEventModal();
  const titleInput = document.getElementById('event-title-input');
  const descInput = document.getElementById('event-desc-input');
  const deadlineInput = document.getElementById('event-deadline-input');
  if(titleInput) titleInput.value = eventModalTitle;
  if(descInput) descInput.value = eventModalDesc;
  if(deadlineInput) deadlineInput.value = eventModalDeadline;
}

function renderEventModal(){
  document.getElementById('modal-box').innerHTML = `
    <div class="modal-head">
      <h2>📅 予定を追加</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="background:rgba(232,178,61,0.06);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:var(--text-dim);">
      💡 予定を追加すると、メンバーが出席・欠席を登録できるようになります。
    </div>
    <label>タイトル<span class="req-mark">*</span></label>
    <input type="text" id="event-title-input" placeholder="例:定期対戦会" value="${escapeHtml(eventModalTitle)}">

    <label>出席確認</label>
    <div class="choice-group">
      <div class="choice ${eventModalAttendanceRequired?'win selected':''}" onclick="eventModalSetAttendance(true)">有</div>
      <div class="choice ${!eventModalAttendanceRequired?'loss selected':''}" onclick="eventModalSetAttendance(false)">無</div>
    </div>
    <div class="attend-toggle-hint">「無」の場合、この予定には出席・欠席の登録は行われません。</div>

    <div class="date-section" id="event-date-section">
      <label>開催日<span class="req-mark">*</span></label>
      <div class="attend-toggle-hint">期間で範囲指定するか、カレンダーで個別の日にちをタップして選択してください</div>
      <div class="date-mode-row">
        <div class="row">
          <div>
            <label>開始日</label>
            <input type="date" id="event-range-start">
          </div>
          <div>
            <label>終了日</label>
            <input type="date" id="event-range-end">
          </div>
        </div>
        <button type="button" class="btn-small" onclick="eventModalApplyRange()">範囲を追加</button>
      </div>
      ${pickerCalendarHtml('eventModalToggleDate')}
    </div>

    <label>詳細(任意)</label>
    <textarea id="event-desc-input" placeholder="例:オンライン、19時集合">${escapeHtml(eventModalDesc)}</textarea>

    ${eventModalAttendanceRequired ? `
    <label>出席確認の期限日(任意)</label>
    <input type="date" id="event-deadline-input" value="${escapeHtml(eventModalDeadline)}">
    <div class="attend-toggle-hint">期限を過ぎると、この予定の出席確認が赤く表示されます。</div>
    ` : ''}

    <button class="primary" onclick="submitEventModal()">予定を追加する</button>
  `;
}

function flagFieldError(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('input-error');
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.addEventListener('input', function clear(){ el.classList.remove('input-error'); el.removeEventListener('input', clear); });
  el.focus({preventScroll:true});
  el.scrollIntoView({behavior:'smooth', block:'center'});
}

function flagSectionError(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.add('input-error');
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.scrollIntoView({behavior:'smooth', block:'center'});
}

async function submitEventModal(){
  const titleInput = document.getElementById('event-title-input');
  const title = titleInput.value.trim();
  const description = document.getElementById('event-desc-input').value.trim();
  const deadlineInput = document.getElementById('event-deadline-input');
  const attendanceDeadline = deadlineInput ? deadlineInput.value : '';
  const dates = Array.from(picker.dates).sort();
  const missing = [];
  if(!title){ flagFieldError('event-title-input'); missing.push('タイトル'); }
  if(dates.length===0){ flagSectionError('event-date-section'); missing.push('開催日'); }
  if(missing.length){ showToast(`${missing.join('・')}を入力してください`); return; }
  data.events.push({id: genId(), title, description, dates, attendanceRequired: eventModalAttendanceRequired, attendanceDeadline: attendanceDeadline || null, attendance:{}});
  await saveData();
  closeModal();
  renderSchedule();
  showToast('予定を追加しました');
}

let tournamentModalTitle = '';
let tournamentModalDesc = '';
let tournamentModalResult = '';
let editingTournamentId = null;

function openTournamentModal(id){
  editingTournamentId = id || null;
  if(editingTournamentId){
    const t = (data.tournaments||[]).find(t=>t.id===editingTournamentId);
    if(!t){ editingTournamentId = null; }
    tournamentModalTitle = t ? t.title : '';
    tournamentModalDesc = t ? (t.description||'') : '';
    tournamentModalResult = t ? (t.result||'') : '';
    pickerInit(t ? t.dates : []);
  } else {
    tournamentModalTitle = '';
    tournamentModalDesc = '';
    tournamentModalResult = '';
    pickerInit([]);
  }
  closeModal();
  renderTournamentModal();
  document.getElementById('modal-overlay').style.display = 'flex';
}

// カレンダー操作の直前に入力内容を保存しておく（再描画で消えないように）
function tournamentModalSyncInputs(){
  const titleEl = document.getElementById('tournament-title-input');
  const descEl = document.getElementById('tournament-desc-input');
  const resultEl = document.getElementById('tournament-result-input');
  if(titleEl) tournamentModalTitle = titleEl.value;
  if(descEl) tournamentModalDesc = descEl.value;
  if(resultEl) tournamentModalResult = resultEl.value;
}

function tournamentModalChangeMonth(delta){ tournamentModalSyncInputs(); pickerChangeMonth(delta, 'renderTournamentModal'); }
function tournamentModalToggleDate(d){ tournamentModalSyncInputs(); pickerToggleDate(d, 'renderTournamentModal'); }
function tournamentModalClear(){ tournamentModalSyncInputs(); pickerClear('renderTournamentModal'); }
function tournamentModalApplyRange(){ tournamentModalSyncInputs(); pickerApplyRange('tournament-range-start','tournament-range-end','renderTournamentModal'); }

function renderTournamentModal(){
  const isEditing = !!editingTournamentId;
  document.getElementById('modal-box').innerHTML = `
    <div class="modal-head">
      <h2>🏆 大会記録を${isEditing?'編集':'追加'}</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <label>大会名<span class="req-mark">*</span></label>
    <input type="text" id="tournament-title-input" placeholder="例:第3回 内部トーナメント" value="${escapeHtml(tournamentModalTitle)}">

    <div class="date-section" id="tournament-date-section">
      <label>開催日<span class="req-mark">*</span></label>
      <div class="attend-toggle-hint">期間で範囲指定するか、カレンダーで個別の日にちをタップして選択してください</div>
      <div class="date-mode-row">
        <div class="row">
          <div>
            <label>開始日</label>
            <input type="date" id="tournament-range-start">
          </div>
          <div>
            <label>終了日</label>
            <input type="date" id="tournament-range-end">
          </div>
        </div>
        <button type="button" class="btn-small" onclick="tournamentModalApplyRange()">範囲を追加</button>
      </div>
      ${pickerCalendarHtml('tournamentModalToggleDate')}
    </div>

    <label>概要(任意)</label>
    <textarea id="tournament-desc-input" placeholder="例:参加12名、シングルエリミネーション">${escapeHtml(tournamentModalDesc)}</textarea>

    <label>結果(任意)</label>
    <textarea id="tournament-result-input" placeholder="例:優勝 プライドチキン">${escapeHtml(tournamentModalResult)}</textarea>

    <button class="primary" onclick="submitTournamentModal()">${isEditing?'更新する':'追加する'}</button>
  `;
}

async function submitTournamentModal(){
  const title = document.getElementById('tournament-title-input').value.trim();
  const description = document.getElementById('tournament-desc-input').value.trim();
  const result = document.getElementById('tournament-result-input').value.trim();
  const dates = Array.from(picker.dates).sort();
  const missing = [];
  if(!title){ flagFieldError('tournament-title-input'); missing.push('大会名'); }
  if(dates.length===0){ flagSectionError('tournament-date-section'); missing.push('開催日'); }
  if(missing.length){ showToast(`${missing.join('・')}を入力してください`); return; }
  if(editingTournamentId){
    const t = (data.tournaments||[]).find(t=>t.id===editingTournamentId);
    if(t){
      t.title = title;
      t.description = description;
      t.result = result;
      t.dates = dates;
    }
  } else {
    data.tournaments.push({id: genId(), title, description, result, dates});
  }
  tournamentModalTitle = '';
  tournamentModalDesc = '';
  tournamentModalResult = '';
  const wasEditing = !!editingTournamentId;
  editingTournamentId = null;
  await saveData();
  closeModal();
  renderSchedule();
  showToast(wasEditing ? '大会記録を更新しました' : '大会記録を追加しました');
}


// このページの再描画エントリポイント(Firebaseからの更新反映・初期表示で使用)
function renderCurrentPage(){
  renderSchedule();
}

(async function(){
  document.getElementById('view-schedule').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
  // 他ページ(メンバー/マイページ)から大会名バッジ経由で遷移してきた場合、該当日を開く
  const params = new URLSearchParams(location.search);
  const openDate = params.get('openDate');
  if(openDate){
    openDayModal(openDate);
    history.replaceState(null, '', location.pathname);
  }
})();
