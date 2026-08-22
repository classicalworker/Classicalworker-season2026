function renderMyPage(){
  const el = document.getElementById('view-mypage');
  const names = Object.keys(data.players);

  currentPlayer = null;
  opponentName = '';
  pendingResult = null;
  savedScoreMe = 0;
  savedScoreOpp = 0;
  selectedEventId = '';
  newEventNameInput = '';
  editingMatchIndex = null;

  let selectHtml = `<select id="player-select" onchange="onPlayerChange(this.value)">
    <option value="" selected>選択してください</option>`;
  names.forEach(n=>{
    selectHtml += `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`;
  });
  selectHtml += `<option value="__new__">＋ 新規参加者登録</option></select>`;

  let html = `
    <div class="card">
      <h2><span class="tag">STEP 1</span>自分を選択</h2>
      ${selectHtml}
      <div id="new-player-box" style="display:none">
        <label>参加者名</label>
        <input type="text" id="new-player-name" placeholder="例:ハヤト">
        <button class="primary" onclick="registerPlayer()">登録する</button>
      </div>
    </div>`;

  el.innerHTML = html;
}

function renderMyPageWithPlayer(){
  const el = document.getElementById('view-mypage');
  const names = Object.keys(data.players);
  
  if(!currentPlayer || !data.players[currentPlayer]){
    renderMyPage();
    return;
  }

  const p = data.players[currentPlayer];
  const s = computeStats(p);

  const eventOptions = [
    ...(data.events||[]).map(ev => 
      `<option value="event:${escapeHtml(ev.id)}" ${selectedEventId===('event:'+ev.id)?'selected':''}>${escapeHtml(ev.title)}</option>`
    ),
    ...(data.tournaments||[]).map(t => 
      `<option value="tournament:${escapeHtml(t.id)}" ${selectedEventId===('tournament:'+t.id)?'selected':''}>${escapeHtml(t.title)}</option>`
    )
  ].join('');

  // 対戦相手入力欄（自由入力＋既存プレイヤー選択）
  const existingPlayers = names.filter(n=>n!==currentPlayer);
  const playerOptions = existingPlayers.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

  // スコアボタンの状態を再現
  const scoreMeHtml = Array.from({length:11}, (_,i) => 
    `<button class="score-btn ${i===savedScoreMe?'active':''}" onclick="setScoreMe(${i})">${i}</button>`
  ).join('');
  const scoreOppHtml = Array.from({length:11}, (_,i) => 
    `<button class="score-btn ${i===savedScoreOpp?'active':''}" onclick="setScoreOpp(${i})">${i}</button>`
  ).join('');

  // 現在の目標入力値を保持（再描画時に消えないように）
  const currentGoalValue = document.getElementById('main-goal-input') ? document.getElementById('main-goal-input').value : (p.mainGoal || '');

  // 使用デバイスの選択肢
  const deviceOptions = [['lever','レバー'],['leverless','レバーレス'],['pad','パッド'],['other','その他']];
  const deviceChecksHtml = deviceOptions.map(([val,label])=>{
    const checked = (p.devices||[]).includes(val);
    return `<label class="checkbox-choice ${checked?'checked-cb':''}">
      <input type="checkbox" class="device-type-cb" value="${val}" ${checked?'checked':''} onchange="this.closest('.checkbox-choice').classList.toggle('checked-cb', this.checked)">
      <span>${label}</span>
    </label>`;
  }).join('');

  // メインプラットフォームの選択肢
  const platformOptions = ['PS4','PS5','XBOX','Switch2','PC'];
  const platformChecksHtml = platformOptions.map(val=>{
    const checked = (p.platforms||[]).includes(val);
    return `<label class="checkbox-choice ${checked?'checked-cb':''}">
      <input type="checkbox" class="platform-cb" value="${val}" ${checked?'checked':''} onchange="this.closest('.checkbox-choice').classList.toggle('checked-cb', this.checked)">
      <span>${val}</span>
    </label>`;
  }).join('');

  const iconPreviewHtml = (pendingIconData || p.icon)
    ? `<img src="${pendingIconData || p.icon}" alt="">`
    : `<span class="no-icon">なし</span>`;

  let html = `
    <div class="card">
      <h2><span class="tag">STEP 1</span>自分を選択</h2>
      <select id="player-select" onchange="onPlayerChange(this.value)">
        <option value="">選択してください</option>
        ${Object.keys(data.players).map(n=>`<option value="${escapeHtml(n)}" ${currentPlayer===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}
        <option value="__new__">＋ 新規参加者登録</option>
      </select>
      <div id="new-player-box" style="display:none">
        <label>参加者名</label>
        <input type="text" id="new-player-name" placeholder="例:ハヤト">
        <button class="primary" onclick="registerPlayer()">登録する</button>
      </div>
    </div>
    <div class="card">
      <h2><span class="tag">STEP 2</span>プロフィール</h2>
      <label>操作タイプ</label>
      <div class="choice-group">
        <label class="checkbox-choice ${(p.controlTypes||[]).includes('C')?'checked-cb':''}">
          <input type="checkbox" id="control-type-c" ${(p.controlTypes||[]).includes('C')?'checked':''} onchange="this.closest('.checkbox-choice').classList.toggle('checked-cb', this.checked)">
          <span>クラシック(C)</span>
        </label>
        <label class="checkbox-choice ${(p.controlTypes||[]).includes('M')?'checked-cb':''}">
          <input type="checkbox" id="control-type-m" ${(p.controlTypes||[]).includes('M')?'checked':''} onchange="this.closest('.checkbox-choice').classList.toggle('checked-cb', this.checked)">
          <span>モダン(M)</span>
        </label>
      </div>
      <label>最大MR</label>
      <input type="number" id="max-mr-input" value="${escapeHtml(p.maxMR||'')}" placeholder="例:1800">

      <label>ユーザーコード</label>
      <input type="text" id="user-code-input" value="${escapeHtml(p.userCode||'')}" placeholder="例:1234567890">

      <label>使用デバイス</label>
      <div class="choice-group" style="flex-wrap:wrap">
        ${deviceChecksHtml}
      </div>
      <input type="text" id="device-name-input" value="${escapeHtml(p.deviceName||'')}" placeholder="デバイス名を入力(例:Hitbox、〇〇製レバーレス等)" style="margin-top:8px">

      <label>メインプラットフォーム</label>
      <div class="choice-group" style="flex-wrap:wrap">
        ${platformChecksHtml}
      </div>

      <label>アイコン画像</label>
      <div class="icon-upload-row">
        <div class="icon-preview-box" id="icon-preview">${iconPreviewHtml}</div>
        <input type="file" id="icon-file-input" accept="image/*" onchange="handleIconUpload(this)">
      </div>

      <label>🔴 配信の自動通知(推奨)</label>
      <div class="attend-toggle-hint">Twitchのログイン名を登録しておくと、配信を始めるだけで自動的にTOP画面へ表示されます(10分おきに自動チェックするため、反映まで少し時間がかかります)。URLを毎回貼り直す必要はありません。<br>※YouTubeは仕様上、自動検知が安定して行えないため非対応です。YouTubeで配信する場合は下の「配信URL(手動)」をご利用ください。</div>

      <label>Twitchログイン名(任意)</label>
      <input type="text" id="twitch-login-input" value="${escapeHtml(p.twitchLogin||'')}" placeholder="例:あなたのTwitchチャンネル名(twitch.tv/の後ろの部分)">

      <label style="margin-top:20px">配信URL(手動・任意)</label>
      <div class="stream-url-row">
        <input type="url" id="stream-url-input" value="${escapeHtml(p.streamUrl||'')}" placeholder="例:https://www.youtube.com/watch?v=xxxxxxxxxxx">
      </div>
      <div class="attend-toggle-hint">YouTubeで配信する場合や、Twitch以外で配信する場合はこちらにURLを入力し、配信の開始・終了時に下の「配信中」を手動で切り替えてください。</div>

      <label>配信タイトル(手動・任意)</label>
      <input type="text" id="stream-title-input" value="${escapeHtml(p.streamTitle||'')}" placeholder="例:ランクマ配信、耐久マラソン中">
      <div class="attend-toggle-hint">上の「配信URL(手動)」を使う場合のみ、ここに入力した内容がTOP画面に表示されます。</div>

      <div class="stream-live-toggle">
        <input type="checkbox" id="stream-live-checkbox" ${p.isLive?'checked':''}>
        <label for="stream-live-checkbox">📡 今、配信中(手動設定の場合のみ使用。TOP画面に「Now on Air」として表示されます)</label>
      </div>

      <button class="primary" onclick="saveProfileStep2()">プロフィールを保存</button>
      <div id="step2-save-status" style="font-size:12px;color:var(--text-dim);margin-top:6px;text-align:center;"></div>
    </div>

    <div class="card">
      <h2><span class="tag">STEP 3</span>対戦結果を記録</h2>
      <label>大会名（オプション）</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="event-select" style="flex:1;" onchange="onEventSelect(this.value)">
          <option value="">選択してください</option>
          ${eventOptions}
          <option value="__new__" ${selectedEventId==='__new__'?'selected':''}>＋ 新規入力</option>
        </select>
      </div>
      <div id="new-event-input-box" style="display:${selectedEventId==='__new__'?'block':'none'};margin-top:6px;">
        <input type="text" id="new-event-name" placeholder="大会名を入力" style="width:100%;" value="${escapeHtml(newEventNameInput)}" oninput="newEventNameInput=this.value">
      </div>
      <div class="attend-toggle-hint">予定タブで登録した予定・大会記録を選択すると、その大会と結果が連携されます。</div>

      <label style="margin-top:12px">対戦相手（入力または選択）</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" id="opponent-input" placeholder="対戦相手の名前を入力" style="flex:1;" value="${escapeHtml(opponentName)}" oninput="opponentName=this.value">
        <span style="color:var(--text-dim);font-size:11px;">または</span>
        <select id="opponent-select" style="flex:1;" onchange="document.getElementById('opponent-input').value=this.value; opponentName=this.value;">
          <option value="">選択する</option>
          ${playerOptions}
        </select>
      </div>

      <label style="margin-top:12px">スコア（自分 - 相手）</label>
      <div class="score-vs">自分</div>
      <div class="score-buttons" id="score-me-buttons">
        ${scoreMeHtml}
      </div>
      <div class="score-vs">− 対 −</div>
      <div class="score-buttons" id="score-opp-buttons">
        ${scoreOppHtml}
      </div>
      <div class="score-vs">相手</div>

      <label style="margin-top:12px">結果</label>
      <div class="choice-group">
        <div class="choice win ${pendingResult==='win'?'selected':''}" onclick="setResult('win')">勝ち</div>
        <div class="choice loss ${pendingResult==='loss'?'selected':''}" onclick="setResult('loss')">負け</div>
      </div>
      <button class="primary" onclick="recordMatch()">記録する</button>
    </div>

    <div class="card">
      <h2><span class="tag">STEP 4</span>今シーズンの目標</h2>
      <label>目標(このシーズンで一番達成したいこと)</label>
      <input type="text" id="main-goal-input" value="${escapeHtml(currentGoalValue || p.mainGoal || '')}" placeholder="例:Act毎3000試合こなす">
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer">
        <input type="checkbox" id="main-goal-done-checkbox" ${p.mainGoalDone?'checked':''}>
        <span style="color:var(--text)">目標を達成した</span>
      </label>

      <label style="margin-top:20px">ミッション(5〜25個)</label>
      ${renderGoalList(p)}
      <label>よくある課題から選ぶ</label>
      <div class="choice-group" style="flex-wrap:wrap">${renderGoalChips(p)}</div>
      <label>新しいミッションを追加(自由入力)</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" id="goal-input" placeholder="例:毎日リプレイを視聴する" style="flex:1;">
        <button class="primary" onclick="addGoal()" style="margin:0;padding:8px 16px;width:auto;font-size:12px;flex-shrink:0;">追加</button>
      </div>
      <button class="primary" onclick="saveStep4()" style="margin-top:14px;">目標を保存</button>
      <div id="step4-save-status" style="font-size:12px;color:var(--text-dim);margin-top:6px;text-align:center;"></div>
      <div style="margin-top:16px">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);letter-spacing:.03em;margin-bottom:6px">ミッション達成率</div>
        <div class="gauge-row">
          <div class="gauge"><div class="gauge-fill goal" style="width:${s.goalAchievement!==null?s.goalAchievement.toFixed(0):0}%"></div></div>
          <span class="gauge-val">${s.goalAchievement!==null?s.goalDone+'/'+s.goalTotal:'–'}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>対戦履歴（編集可能）</h2>
      ${renderHistoryEditable(p)}
    </div>`;

  el.innerHTML = html;

  // 未読の対戦通知があればポップアップで通知する
  showMatchNotifications(currentPlayer, p);
}

function handleIconUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('画像ファイルを選択してください'); return; }
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      // 正方形に中央トリミングして縮小し、データサイズを抑える
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      pendingIconData = canvas.toDataURL('image/jpeg', 0.85);
      const preview = document.getElementById('icon-preview');
      if(preview) preview.innerHTML = `<img src="${pendingIconData}" alt="">`;
      showToast('画像を読み込みました(保存ボタンで確定します)');
    };
    img.onerror = function(){ showToast('画像の読み込みに失敗しました'); };
    img.src = e.target.result;
  };
  reader.onerror = function(){ showToast('画像の読み込みに失敗しました'); };
  reader.readAsDataURL(file);
}

// twitch.tv/xxxx のようなURLが貼られた場合でも、ログイン名だけを抜き出す
function parseTwitchLoginInput(raw){
  if (!raw) return '';
  const m = raw.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i);
  if (m) return m[1];
  return raw.replace(/^@/, '');
}

async function saveProfileStep2(){
  if(!currentPlayer) {
    showToast('先に自分を選択してください');
    return;
  }
  const controlTypes = [];
  if(document.getElementById('control-type-c').checked) controlTypes.push('C');
  if(document.getElementById('control-type-m').checked) controlTypes.push('M');
  const maxMR = document.getElementById('max-mr-input').value.trim();
  const userCode = document.getElementById('user-code-input').value.trim();
  const devices = Array.from(document.querySelectorAll('.device-type-cb:checked')).map(el=>el.value);
  const deviceName = document.getElementById('device-name-input').value.trim();
  const platforms = Array.from(document.querySelectorAll('.platform-cb:checked')).map(el=>el.value);
  const streamUrlRaw = document.getElementById('stream-url-input').value.trim();
  const streamTitleRaw = document.getElementById('stream-title-input').value.trim();
  const isLive = document.getElementById('stream-live-checkbox').checked;
  const twitchLoginRaw = parseTwitchLoginInput(document.getElementById('twitch-login-input').value.trim());

  const player = data.players[currentPlayer];
  player.controlTypes = controlTypes;
  player.maxMR = maxMR;
  player.userCode = userCode;
  player.devices = devices;
  player.deviceName = deviceName;
  player.platforms = platforms;
  player.streamUrl = streamUrlRaw;
  player.streamTitle = streamTitleRaw;
  player.isLive = !!isLive;
  player.twitchLogin = twitchLoginRaw;
  if(pendingIconData){
    player.icon = pendingIconData;
    pendingIconData = null;
  }
  
  await saveData();
  
  const statusEl = document.getElementById('step2-save-status');
  if(statusEl){
    statusEl.textContent = '✅ プロフィールを保存しました';
    statusEl.style.color = 'var(--win)';
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2500);
  }
  showToast(isLive && !streamUrlRaw
    ? 'プロフィールを保存しました(⚠️配信URL未入力のため視聴リンクは表示されません)'
    : 'プロフィールを保存しました');
}

async function saveStep4(){
  if(!currentPlayer) {
    showToast('先に自分を選択してください');
    return;
  }
  
  const goalInput = document.getElementById('main-goal-input');
  const doneCheckbox = document.getElementById('main-goal-done-checkbox');
  
  if(!goalInput || !doneCheckbox) {
    showToast('要素が見つかりません');
    return;
  }
  
  const goalVal = goalInput.value.trim();
  const isDone = doneCheckbox.checked;

  const player = data.players[currentPlayer];
  player.mainGoal = goalVal;
  player.mainGoalDone = isDone;
  if(isDone && !player.mainGoalAchievedAt){
    player.mainGoalAchievedAt = new Date().toISOString();
  } else if(!isDone){
    player.mainGoalAchievedAt = null;
  }
  
  await saveData();
  
  const statusEl = document.getElementById('step4-save-status');
  if(statusEl){
    statusEl.textContent = '✅ 目標を保存しました';
    statusEl.style.color = 'var(--win)';
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2500);
  }
  showToast('目標を保存しました');
}

function setScoreMe(val){
  savedScoreMe = val;
  // 大会名保持のため、現在の選択を保存
  const evSelect = document.getElementById('event-select');
  if(evSelect) selectedEventId = evSelect.value;
  renderMyPageWithPlayer();
}

function setScoreOpp(val){
  savedScoreOpp = val;
  const evSelect = document.getElementById('event-select');
  if(evSelect) selectedEventId = evSelect.value;
  renderMyPageWithPlayer();
}

function onEventSelect(value){
  selectedEventId = value;
  renderMyPageWithPlayer();
}

function renderGoalChips(p){
  const existing = new Set((p.goals||[]).map(g=>g.text));
  return GENERIC_GOALS.map((g, idx)=>{
    if(!g.needsCount){
      const text = g.build();
      if(existing.has(text)) return '';
      return `<div class="choice" style="flex:none;padding:7px 12px;font-weight:500;font-size:12px" onclick="addGoalPreset('${text.replace(/'/g,"\\'")}')">+ ${escapeHtml(g.label)}</div>`;
    }
    if(presetExpanded[idx]){
      return `<div style="display:flex;align-items:center;gap:6px;background:#0f0f16;border:1px solid var(--panel-border);border-radius:8px;padding:6px 8px">
        <span style="font-size:12px;color:var(--text-dim)">${escapeHtml(g.label.replace('〇','_'))}</span>
        <input type="number" min="1" id="preset-count-${idx}" placeholder="回数" style="width:64px;padding:6px">
        <button class="ghost" style="color:var(--win);border-color:var(--win)" onclick="confirmPresetCount(${idx})">追加</button>
        <button class="ghost" onclick="cancelPresetCount(${idx})">×</button>
      </div>`;
    }
    return `<div class="choice" style="flex:none;padding:7px 12px;font-weight:500;font-size:12px" onclick="togglePresetCount(${idx})">+ ${escapeHtml(g.label)}</div>`;
  }).join('') || '<div class="empty" style="padding:6px 0;font-size:12px">追加できる定型目標はすべて選択済みです</div>';
}

function togglePresetCount(idx){ presetExpanded = {[idx]:true}; renderMyPageWithPlayer(); }
function cancelPresetCount(idx){ presetExpanded[idx] = false; renderMyPageWithPlayer(); }

async function confirmPresetCount(idx){
  const input = document.getElementById('preset-count-'+idx);
  const n = parseInt(input.value, 10);
  if(!n || n<=0){ showToast('回数を入力してください'); return; }
  presetExpanded[idx] = false;
  await addGoalPreset(GENERIC_GOALS[idx].build(n));
}

function renderGoalList(p){
  const goals = p.goals || [];
  if(goals.length===0) return '<div class="empty" style="padding:14px 0">まだ目標がありません。下から追加してください</div>';
  return `<div style="margin-bottom:6px">` + goals.map((g, i)=>`
    <div class="history-item">
      <span style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <input type="checkbox" ${g.done?'checked':''} onchange="toggleGoal(${i})" style="flex-shrink:0">
        <span style="${g.done?'color:var(--win);text-decoration:line-through':''};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.text)}</span>
      </span>
      <button class="ghost" onclick="deleteGoal(${i})">削除</button>
    </div>`).join('') + `</div>`;
}

// 編集可能な履歴表示（インライン編集）
function renderHistoryEditable(p){
  const matches = p.matches || [];
  if(matches.length===0) return '<div class="empty">まだ記録がありません</div>';

  const names = Object.keys(data.players);

  return matches.map((m, idx) => {
    const isEditing = (editingMatchIndex === idx);
    const eventStr = m.eventName || '';
    const scoreParts = m.score ? m.score.split('-') : ['',''];
    const scoreMe = scoreParts[0] || '';
    const scoreOpp = scoreParts[1] || '';

    if(isEditing){
      // 編集フォーム
      return `
        <div class="match-edit-row" style="background:rgba(232,178,61,0.08);border:1px solid var(--gold);">
          <input type="text" id="edit-opponent-${idx}" value="${escapeHtml(m.opponent)}" placeholder="相手" style="flex:1.5;">
          <div class="score-edit">
            <input type="number" id="edit-score-me-${idx}" value="${escapeHtml(scoreMe)}" min="0" style="width:45px;">
            <span>−</span>
            <input type="number" id="edit-score-opp-${idx}" value="${escapeHtml(scoreOpp)}" min="0" style="width:45px;">
          </div>
          <select id="edit-result-${idx}">
            <option value="win" ${m.result==='win'?'selected':''}>勝ち</option>
            <option value="loss" ${m.result==='loss'?'selected':''}>負け</option>
          </select>
          <button class="primary" style="margin:0;padding:4px 10px;font-size:11px;width:auto;" onclick="saveMatchEdit(${idx})">保存</button>
          <button class="ghost" style="margin:0;padding:4px 10px;font-size:11px;" onclick="cancelMatchEdit()">取消</button>
        </div>
      `;
    }

    const eventBadge = eventStr
      ? (m.eventId && m.eventType
          ? `<span class="tournament-badge" onclick="jumpToEvent('${escapeHtml(m.eventId)}','${escapeHtml(m.eventType)}')">${escapeHtml(eventStr)}</span>`
          : `<span class="tournament-badge manual-badge">${escapeHtml(eventStr)}</span>`)
      : '';

    return `
      <div class="history-item">
        <div class="history-main">
          <div class="top">
            <span class="names">${escapeHtml(currentPlayer)} vs ${escapeHtml(m.opponent)}</span>
            ${eventBadge}
          </div>
          ${m.score ? `<div class="score-display"><span class="score-me">${escapeHtml(scoreMe)}</span><span class="vs">vs</span><span class="score-opp">${escapeHtml(scoreOpp)}</span></div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span class="pill ${m.result}">${m.result==='win'?'WIN':'LOSE'}</span>
          <button class="edit-btn" onclick="startMatchEdit(${idx})" style="font-size:10px;padding:2px 6px;">✎</button>
          <button class="ghost" onclick="undoMatch(${idx})" style="font-size:10px;padding:2px 6px;">削除</button>
        </div>
      </div>`;
  }).join('');
}

function startMatchEdit(idx){
  editingMatchIndex = idx;
  renderMyPageWithPlayer();
}

function cancelMatchEdit(){
  editingMatchIndex = null;
  renderMyPageWithPlayer();
}

async function saveMatchEdit(idx){
  if(!currentPlayer) return;
  const opponent = document.getElementById(`edit-opponent-${idx}`).value.trim();
  const scoreMe = parseInt(document.getElementById(`edit-score-me-${idx}`).value, 10) || 0;
  const scoreOpp = parseInt(document.getElementById(`edit-score-opp-${idx}`).value, 10) || 0;
  const result = document.getElementById(`edit-result-${idx}`).value;
  if(!opponent){ showToast('対戦相手を入力してください'); return; }

  const match = data.players[currentPlayer].matches[idx];
  const oldOpponent = match.opponent;
  const oldScore = match.score;
  const oldResult = match.result;
  const newScore = `${scoreMe}-${scoreOpp}`;

  // 自分の試合を更新
  match.opponent = opponent;
  match.score = newScore;
  match.result = result;

  // 相手の試合も更新（存在する場合）
  if(data.players[oldOpponent]){
    const oppMatches = data.players[oldOpponent].matches;
    for(let i=0; i<oppMatches.length; i++){
      if(oppMatches[i].opponent === currentPlayer && oppMatches[i].score === oldScore && oppMatches[i].result === (oldResult === 'win' ? 'loss' : 'win')){
        oppMatches[i].opponent = opponent;
        oppMatches[i].score = `${scoreOpp}-${scoreMe}`;
        oppMatches[i].result = result === 'win' ? 'loss' : 'win';
        break;
      }
    }
  }

  // もし相手が変わった場合で、新しい相手が既存プレイヤーならその相手にも反映
  if(opponent !== oldOpponent && data.players[opponent]){
    // 相手の試合に追加（古い相手の分は削除済み）
    const oppResult = result === 'win' ? 'loss' : 'win';
    data.players[opponent].matches.push({
      opponent: currentPlayer,
      result: oppResult,
      score: `${scoreOpp}-${scoreMe}`,
      eventName: match.eventName || '',
      eventId: match.eventId || null,
      eventType: match.eventType || null,
      date: match.date || new Date().toISOString()
    });
  }

  editingMatchIndex = null;
  await saveData();
  renderMyPageWithPlayer();
  showToast('更新しました');
}

function onPlayerChange(v){
  if(v==='__new__'){
    document.getElementById('new-player-box').style.display='block';
    currentPlayer = null;
  } else {
    currentPlayer = v || null;
    opponentName = '';
    pendingResult = null;
    savedScoreMe = 0;
    savedScoreOpp = 0;
    selectedEventId = '';
    newEventNameInput = '';
    editingMatchIndex = null;
    pendingIconData = null;
    if(currentPlayer){
      renderMyPageWithPlayer();
    } else {
      renderMyPage();
    }
  }
}

async function registerPlayer(){
  const input = document.getElementById('new-player-name');
  const name = input.value.trim();
  if(!name){ showToast('名前を入力してください'); return; }
  if(data.players[name]){ showToast('その名前は既に登録されています'); return; }
  data.players[name] = {
    matches:[], goals:[], controlTypes:[], maxMR:'', mainGoal:'', mainGoalDone:false,
    userCode:'', devices:[], deviceName:'', platforms:[], icon:'', notifications:[]
  };
  currentPlayer = name;
  await saveData();
  renderMyPageWithPlayer();
  showToast(`${name} さんを登録しました`);
}

function setResult(r){ 
  pendingResult = r; 
  // 大会名保持のため、現在の選択を保存
  const evSelect = document.getElementById('event-select');
  if(evSelect) selectedEventId = evSelect.value;
  renderMyPageWithPlayer();
}

async function recordMatch(){
  if(!currentPlayer) {
    showToast('先に自分を選択してください');
    return;
  }
  
  // currentPlayerがデータに存在するか確認
  if(!data.players[currentPlayer]) {
    showToast('プレイヤーデータが見つかりません');
    return;
  }
  
  const oppInput = document.getElementById('opponent-input');
  const opponent = oppInput ? oppInput.value.trim() : '';
  if(!opponent){ showToast('対戦相手を入力または選択してください'); return; }
  if(!pendingResult){ showToast('勝敗を選択してください'); return; }
  
  const scoreStr = `${savedScoreMe}-${savedScoreOpp}`;
  
  const eventSelect = document.getElementById('event-select');
  let eventName = '';
  let eventId = null;
  let eventType = null;
  if(eventSelect){
    const selectedValue = eventSelect.value;
    if(selectedValue === '__new__'){
      const newEventInput = document.getElementById('new-event-name');
      eventName = newEventInput ? newEventInput.value.trim() : '';
    } else if(selectedValue.startsWith('event:')){
      const id = selectedValue.slice(6);
      const ev = data.events.find(e => e.id === id);
      if(ev){ eventName = ev.title; eventId = id; eventType = 'event'; }
    } else if(selectedValue.startsWith('tournament:')){
      const id = selectedValue.slice(11);
      const t = data.tournaments.find(t => t.id === id);
      if(t){ eventName = t.title; eventId = id; eventType = 'tournament'; }
    }
  }
  
  // 自分のプレイヤーオブジェクトが存在するか確認してからpush
  if(!data.players[currentPlayer]) {
    data.players[currentPlayer] = {
      matches:[], goals:[], controlTypes:[], maxMR:'', mainGoal:'', mainGoalDone:false,
      userCode:'', devices:[], deviceName:'', platforms:[], icon:'', notifications:[]
    };
  }
  
  // 自分・相手の対戦記録と通知を同じ日時で紐付ける（削除時に通知も一致させて取り消せるように）
  const matchDate = new Date().toISOString();

  data.players[currentPlayer].matches.push({
    opponent, 
    result: pendingResult, 
    score: scoreStr,
    eventName,
    eventId,
    eventType,
    date: matchDate
  });
  
  // 相手プレイヤーが存在する場合のみ反映
  if(data.players[opponent]){
    const oppResult = pendingResult === 'win' ? 'loss' : 'win';
    data.players[opponent].matches.push({
      opponent: currentPlayer,
      result: oppResult,
      score: `${savedScoreOpp}-${savedScoreMe}`,
      eventName,
      eventId,
      eventType,
      date: matchDate
    });
    // 相手のページを開いたときにポップアップ通知するための記録
    if(!Array.isArray(data.players[opponent].notifications)) data.players[opponent].notifications = [];
    data.players[opponent].notifications.push({
      opponent: currentPlayer,
      result: oppResult,
      score: `${savedScoreOpp}-${savedScoreMe}`,
      eventName,
      date: matchDate
    });
  } else {
    // 相手が未登録の場合は、対戦履歴だけは記録するが、相手側には記録しない
    showToast(`注意: ${opponent} は登録されていません。相手の記録は保存されませんでした。`);
  }
  
  if(eventSelect && eventSelect.value.startsWith('event:')){
    const eventId = eventSelect.value.slice(6);
    const ev = data.events.find(e => e.id === eventId);
    if(ev && ev.attendanceRequired){
      const todayStr = new Date().toISOString().slice(0,10);
      if(!ev.attendance[todayStr]) ev.attendance[todayStr] = {};
      ev.attendance[todayStr][currentPlayer] = 'yes';
    }
  }
  
  pendingResult = null;
  opponentName = '';
  savedScoreMe = 0;
  savedScoreOpp = 0;
  selectedEventId = '';
  newEventNameInput = '';
  await saveData();
  renderMyPageWithPlayer();
  showToast('記録しました');
}

async function undoMatch(idx){
  if(!currentPlayer) return;
  const match = data.players[currentPlayer].matches[idx];
  if(!match) return;
  
  const opponent = match.opponent;
  if(data.players[opponent]){
    const oppMatches = data.players[opponent].matches;
    for(let i = oppMatches.length - 1; i >= 0; i--){
      if(oppMatches[i].opponent === currentPlayer && 
         oppMatches[i].date === match.date){
        oppMatches.splice(i, 1);
        break;
      }
    }
    // 相手がまだ確認していない通知があれば、記録の取り消しに合わせて通知も取り消す
    if(Array.isArray(data.players[opponent].notifications)){
      const oppNotifs = data.players[opponent].notifications;
      for(let i = oppNotifs.length - 1; i >= 0; i--){
        if(oppNotifs[i].opponent === currentPlayer &&
           oppNotifs[i].date === match.date){
          oppNotifs.splice(i, 1);
          break;
        }
      }
    }
  }
  
  data.players[currentPlayer].matches.splice(idx,1);
  editingMatchIndex = null;
  await saveData();
  renderMyPageWithPlayer();
  showToast('削除しました');
}

async function toggleMainGoalDone(checked){
  if(!currentPlayer) return;
  data.players[currentPlayer].mainGoalDone = checked;
  data.players[currentPlayer].mainGoalAchievedAt = checked ? new Date().toISOString() : null;
  await saveData();
  renderMyPageWithPlayer();
  if(checked) showToast('🎉 目標達成、おめでとうございます!');
}

async function addGoalPreset(text){
  if(!currentPlayer) return;
  const goals = data.players[currentPlayer].goals || (data.players[currentPlayer].goals = []);
  if(goals.some(g=>g.text===text)) return;
  if(goals.length >= MAX_GOALS){ showToast(`目標は最大${MAX_GOALS}個までです`); return; }
  goals.push({text, done:false});
  await saveData();
  renderMyPageWithPlayer();
  showToast('追加しました');
}

async function addGoal(){
  if(!currentPlayer) return;
  const input = document.getElementById('goal-input');
  const text = input.value.trim();
  if(!text){ showToast('目標を入力してください'); return; }
  const goals = data.players[currentPlayer].goals || (data.players[currentPlayer].goals = []);
  if(goals.length >= MAX_GOALS){ showToast(`目標は最大${MAX_GOALS}個までです`); return; }
  goals.push({text, done:false});
  await saveData();
  renderMyPageWithPlayer();
  showToast(goals.length < MIN_GOALS_HINT ? `追加しました(目安は${MIN_GOALS_HINT}個以上)` : '追加しました');
}

async function toggleGoal(idx){
  if(!currentPlayer) return;
  const g = data.players[currentPlayer].goals[idx];
  g.done = !g.done;
  await saveData();
  renderMyPageWithPlayer();
}

async function deleteGoal(idx){
  if(!currentPlayer) return;
  data.players[currentPlayer].goals.splice(idx,1);
  await saveData();
  renderMyPageWithPlayer();
}


function renderCurrentPage(){
  if(currentPlayer){
    renderMyPageWithPlayer();
  } else {
    renderMyPage();
  }
}

(async function(){
  document.getElementById('view-mypage').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
