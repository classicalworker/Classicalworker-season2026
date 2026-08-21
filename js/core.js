const database = firebase.database();

const STORAGE_KEY = 'classical_worker_2026_data';
const SEED_PLAYERS = ["にゃんたかたー","プライドチキン","キタロー","ウーロン茶","れんたん","うーろん","ちゃぶ台","シャミセン","なかじま","ゆび","kaz_bwc","こなつ","エインセル河本","せば","しみちん","けんじろう","SAJ","AKAZUKIN","田井中 良樹","こうへー","でみ。","甘えっさん","ラスペーシア","Anne","ののの","shinsei","ココノツ","KFC-11","かーず","横須賀ふたば","サクリ"];

let data = null;
let currentPlayer = null;
let pendingResult = null;
let opponentName = '';
let rankingSubTab = 'winrate';
let editingEventId = null;

// スコアと大会名保持用
let savedScoreMe = 0;
let savedScoreOpp = 0;
let selectedEventId = ''; 
let newEventNameInput = '';

// 編集中の対戦履歴インデックス (マイページ)
let editingMatchIndex = null;

// Firebase同期フラグ
let isFirebaseSyncing = false;
let firebaseListener = null;

const MAX_GOALS = 25;
const MIN_GOALS_HINT = 5;
const GENERIC_GOALS = [
  {label:"通常投げを1試合で〇回通す", needsCount:true, build:n=>`通常投げを1試合で${n}回通す`},
  {label:"1試合のうちのコンボミスを〇回以内", needsCount:true, build:n=>`1試合のうちのコンボミスを${n}回以内`},
  {label:"有利Fを取った後、〇つ以上の択を仕掛ける", needsCount:true, build:n=>`有利Fを取った後、${n}つ以上の択を仕掛ける`},
  {label:"差し返しを1試合中、〇回成功させる", needsCount:true, build:n=>`差し返しを1試合中、${n}回成功させる`},
  {label:"逆択をかける", needsCount:false, build:()=>`逆択をかける`},
  {label:"投げとシミーで相手のガードを崩す", needsCount:false, build:()=>`投げとシミーで相手のガードを崩す`},
  {label:"インパクトを返す", needsCount:false, build:()=>`インパクトを返す`},
  {label:"中段を立つ", needsCount:false, build:()=>`中段を立つ`},
  {label:"バーンアウトしない", needsCount:false, build:()=>`バーンアウトしない`}
];
let presetExpanded = {};
let selectedMember = null;
let pendingIconData = null;
const _today = new Date();
let calendarYear = _today.getFullYear();
let calendarMonth = _today.getMonth();

// 各タブの状態
let tabStates = {
  notice: { currentPlayer: null },
  members: { selectedMember: null },
  ranking: { subTab: 'winrate' },
  mypage: { currentPlayer: null }
};


function defaultData(){
  const players = {};
  SEED_PLAYERS.forEach(n => players[n] = {
    matches:[], goals:[], controlTypes:[], maxMR:'', mainGoal:'', mainGoalDone:false, mainGoalAchievedAt:null,
    userCode:'', devices:[], deviceName:'', platforms:[], icon:'', notifications:[],
    streamUrl:'', streamTitle:'', isLive:false,
    youtubeChannelId:'', twitchLogin:''
  });
  return {players, events:[], tournaments:[]};
}

// データ補正用の共通関数
function normalizeData(data){
  if (!data) return;
  
  // playersの各エントリを補正
  if (data.players) {
    Object.keys(data.players).forEach(key => {
      const p = data.players[key];
      if (!p) return;
      
      // matchesが存在しないか配列でなければ空配列で初期化
      if (!Array.isArray(p.matches)) {
        p.matches = [];
      }
      
      // goalsが存在しないか配列でなければ空配列で初期化
      if (!Array.isArray(p.goals)) {
        p.goals = [];
      }
      
      // controlTypesが存在しないか配列でなければ空配列で初期化
      if (!Array.isArray(p.controlTypes)) {
        p.controlTypes = [];
      }

      // devices/platforms/notificationsが存在しないか配列でなければ空配列で初期化
      if (!Array.isArray(p.devices)) {
        p.devices = [];
      }
      if (!Array.isArray(p.platforms)) {
        p.platforms = [];
      }
      if (!Array.isArray(p.notifications)) {
        p.notifications = [];
      }
      
      // その他のフィールドもデフォルト値で補完
      if (p.maxMR === undefined) p.maxMR = '';
      if (p.mainGoal === undefined) p.mainGoal = '';
      if (p.mainGoalDone === undefined) p.mainGoalDone = false;
      if (p.mainGoalAchievedAt === undefined) p.mainGoalAchievedAt = null;
      if (p.userCode === undefined) p.userCode = '';
      if (p.deviceName === undefined) p.deviceName = '';
      if (p.icon === undefined) p.icon = '';
      if (p.streamUrl === undefined) p.streamUrl = '';
      if (p.streamTitle === undefined) p.streamTitle = '';
      if (p.isLive === undefined) p.isLive = false;
      if (p.youtubeChannelId === undefined) p.youtubeChannelId = '';
      if (p.twitchLogin === undefined) p.twitchLogin = '';
      
      // matches内の各エントリも補正
      p.matches.forEach(m => {
        if (m.eventId === undefined) m.eventId = null;
        if (m.eventType === undefined) m.eventType = null;
        if (m.score === undefined) m.score = '';
        if (m.result === undefined) m.result = 'win';
        if (m.opponent === undefined) m.opponent = '';
        if (m.date === undefined) m.date = new Date().toISOString();
      });
    });
  }
  
  // eventsの補正
  if (data.events) {
    data.events.forEach(ev => {
      if (!Array.isArray(ev.dates)) ev.dates = [];
      if (ev.attendanceRequired === undefined) ev.attendanceRequired = true;
      if (ev.attendanceDeadline === undefined) ev.attendanceDeadline = null;
      if (!ev.attendance) ev.attendance = {};
    });
  } else {
    data.events = [];
  }
  
  // tournamentsの補正
  if (data.tournaments) {
    data.tournaments.forEach(t => {
      if (!Array.isArray(t.dates)) t.dates = [];
    });
  } else {
    data.tournaments = [];
  }
  
  // 古いプロパティを削除
  Object.values(data.players || {}).forEach(p => {
    delete p.mainChar;
    delete p.subChar;
  });
}

// Firebaseからデータを読み込む
async function loadDataFromFirebase(){
  try {
    await window.__authReady;
    const snapshot = await database.ref('classical_worker_data').once('value');
    const firebaseData = snapshot.val();
    if (firebaseData) {
      // データを補正
      normalizeData(firebaseData);
      return firebaseData;
    }
  } catch(e) {
    console.warn('Firebase読み込みエラー:', e);
  }
  return null;
}

// Firebaseにデータを保存
async function saveDataToFirebase(dataToSave){
  if (isFirebaseSyncing) return;
  try {
    isFirebaseSyncing = true;
    await window.__authReady;
    await database.ref('classical_worker_data').set(dataToSave);
  } catch(e) {
    console.error('Firebase保存エラー:', e);
    showToast('Firebaseへの保存に失敗しました');
  } finally {
    isFirebaseSyncing = false;
  }
}

// Firebaseのリアルタイムリスナーを設定
async function setupFirebaseListener(){
  if (firebaseListener) {
    firebaseListener.off();
    firebaseListener = null;
  }
  
  await window.__authReady;
  firebaseListener = database.ref('classical_worker_data');
  firebaseListener.on('value', (snapshot) => {
    const firebaseData = snapshot.val();
    if (!firebaseData) return;
    
    // Firebaseからの更新が自分の更新によるものかチェック
    if (isFirebaseSyncing) return;
    
    // データを補正
    normalizeData(firebaseData);
    
    // 現在のデータと比較して変更があれば更新
    const currentDataStr = JSON.stringify(data);
    const newDataStr = JSON.stringify(firebaseData);
    if (currentDataStr !== newDataStr) {
      data = firebaseData;
      // ローカルストレージにもバックアップ
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch(e) {}
      
      // 現在表示中のページを再描画(各ページのjsが renderCurrentPage を定義する)
      if (typeof renderCurrentPage === 'function') {
        renderCurrentPage();
      }
      showToast('データが更新されました');
    }
  });
}

// ===== 配信自動ステータス(live_status) =====
// GitHub Actions側(サーバー)が定期的にYouTube/Twitchをチェックして書き込む専用ノード。
// クライアント側は読み取り専用(database.rules.jsonで .write:false に設定)。
let liveStatus = {};
let liveStatusListener = null;

async function loadLiveStatus(){
  try{
    await window.__authReady;
    const snapshot = await database.ref('live_status').once('value');
    liveStatus = snapshot.val() || {};
  } catch(e){
    console.warn('配信ステータスの読み込みに失敗しました:', e);
    liveStatus = {};
  }
}

// live_statusの変更をリアルタイムに監視し、更新があればコールバックを呼ぶ(TOPページ用)
async function setupLiveStatusListener(onUpdate){
  await window.__authReady;
  if (liveStatusListener) {
    liveStatusListener.off();
    liveStatusListener = null;
  }
  liveStatusListener = database.ref('live_status');
  liveStatusListener.on('value', (snapshot) => {
    liveStatus = snapshot.val() || {};
    if (typeof onUpdate === 'function') onUpdate();
  });
}

async function loadData(){
  try {
    // まずFirebaseから読み込みを試みる
    const firebaseData = await loadDataFromFirebase();
    if (firebaseData) {
      data = firebaseData;
      // ローカルストレージにもバックアップ
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch(e) {}
      // Firebaseリスナーを設定
      setupFirebaseListener();
      return;
    }
  } catch(e) {
    console.warn('Firebase読み込み失敗:', e);
  }
  
  // Firebaseにデータがない場合はローカルストレージから読み込み
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      data = JSON.parse(stored);
      normalizeData(data);
      // Firebaseにデータを同期
      await saveDataToFirebase(data);
      // Firebaseリスナーを設定
      setupFirebaseListener();
      return;
    }
  } catch(e) {
    console.warn('localStorage読み込み失敗:', e);
  }
  
  // 新規データ作成
  data = defaultData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Firebaseにデータを同期
    await saveDataToFirebase(data);
    // Firebaseリスナーを設定
    setupFirebaseListener();
  } catch(e) {}
}

async function saveData(){
  if (!data) return;
  
  // ローカルストレージに保存
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify(data));
  } catch(e) {
    console.warn('localStorage保存エラー:', e);
  }
  
  // Firebaseに保存
  await saveDataToFirebase(data);
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

// 予定(events)のうち、開催日がすべて過去のものかどうか判定(複数ページ共通)
function isEventFullyPast(ev){
  const todayStr = new Date().toISOString().slice(0,10);
  const dates = ev.dates || [];
  if(dates.length===0) return false;
  return dates.every(d => d < todayStr);
}

function computeStats(p){
  const matches = p.matches || [];
  const total = matches.length;
  const wins = matches.filter(m=>m.result==='win').length;
  const winRate = total>0 ? (wins/total*100) : 0;
  const goals = p.goals || [];
  const doneCount = goals.filter(g=>g.done).length;
  const goalAchievement = goals.length>0 ? (doneCount/goals.length*100) : null;
  return {total, wins, winRate, goalAchievement, goalDone: doneCount, goalTotal: goals.length};
}

function genId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function formatDateBadge(dateStr){
  if(!dateStr) return {d:'-', m:''};
  const dt = new Date(dateStr + 'T00:00:00');
  if(isNaN(dt.getTime())) return {d:'-', m:''};
  return {d: dt.getDate(), m: (dt.getMonth()+1)+'月 ・ '+['日','月','火','水','木','金','土'][dt.getDay()]+'曜'};
}

function formatDayShort(dateStr){
  const dt = new Date(dateStr + 'T00:00:00');
  if(isNaN(dt.getTime())) return dateStr;
  const w = ['日','月','火','水','木','金','土'][dt.getDay()];
  return `${dt.getMonth()+1}/${dt.getDate()}(${w})`;
}

function pad2(n){ return String(n).padStart(2,'0'); }

function openModal(html){
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-box').removeAttribute('data-day-modal');
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal(){
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-box').innerHTML = '';
}

let picker = { dates: new Set(), year: _today.getFullYear(), month: _today.getMonth() };

function getMRColor(mr){
  const minMR = 0, maxMR = 2400;
  const clamped = Math.max(minMR, Math.min(maxMR, mr));
  const normalized = (clamped - minMR) / (maxMR - minMR);
  let r, g, b;
  if (normalized < 0.3) {
    const t = normalized / 0.3;
    r = Math.round(26 + (74 - 26) * t);
    g = Math.round(79 + (168 - 79) * t);
    b = Math.round(193 + (247 - 193) * t);
  } else if (normalized < 0.5) {
    const t = (normalized - 0.3) / 0.2;
    r = Math.round(74 + (220 - 74) * t);
    g = Math.round(168 + (220 - 168) * t);
    b = Math.round(247 + (245 - 247) * t);
  } else if (normalized < 0.7) {
    const t = (normalized - 0.5) / 0.2;
    r = Math.round(220 + (255 - 220) * t);
    g = Math.round(220 + (160 - 220) * t);
    b = Math.round(245 + (60 - 245) * t);
  } else {
    const t = (normalized - 0.7) / 0.3;
    r = 255;
    g = Math.round(160 + (40 - 160) * t);
    b = Math.round(60 + (40 - 60) * t);
  }
  return `rgb(${Math.max(0,Math.min(255,r))}, ${Math.max(0,Math.min(255,g))}, ${Math.max(0,Math.min(255,b))})`;
}

function showMatchNotifications(name, p){
  const notifications = (p.notifications || []).slice();
  if(notifications.length === 0) return;
  const itemsHtml = notifications.map(n=>{
    const resultLabel = n.result === 'win' ? '勝ち' : '負け';
    const scoreStr = n.score ? `(${escapeHtml(n.score)})` : '';
    const eventStr = n.eventName ? `<div class="rank-meta" style="margin-top:2px">${escapeHtml(n.eventName)}</div>` : '';
    return `<div class="history-item">
      <div class="history-main">
        <div class="top"><span class="names">vs ${escapeHtml(n.opponent)}</span></div>
        <div class="score-display">${scoreStr}</div>
        ${eventStr}
      </div>
      <span class="pill ${n.result}">${resultLabel==='勝ち'?'WIN':'LOSE'}</span>
    </div>`;
  }).join('');
  openModal(`
    <div class="modal-head">
      <h2>🔔 対戦結果のお知らせ</h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${escapeHtml(name)}さんの対戦結果が記録されました。</div>
    ${itemsHtml}
  `);
  p.notifications = [];
  saveData();
}

// 大会名バッジを押したらお知らせタブの該当の予定・大会記録の詳細を開く
function jumpToEvent(id, type){
  if(!id || !type) return;
  let dateStr = null;
  if(type === 'event'){
    const ev = (data.events||[]).find(e=>e.id===id);
    if(ev && ev.dates && ev.dates.length) dateStr = ev.dates.slice().sort()[0];
  } else if(type === 'tournament'){
    const t = (data.tournaments||[]).find(t=>t.id===id);
    if(t && t.dates && t.dates.length) dateStr = t.dates.slice().sort()[0];
  }
  if(!dateStr) return;
  // 予定ページ(schedule.html)へ実際に画面遷移し、該当日を開く
  location.href = 'schedule.html?openDate=' + encodeURIComponent(dateStr);
}

async function resetAll(){
  if(!confirm('全データを消去して初期状態に戻します。よろしいですか?')) return;
  data = defaultData();
  currentPlayer = null;
  editingEventId = null;
  selectedMember = null;
  rankingSubTab = 'winrate';
  savedScoreMe = 0;
  savedScoreOpp = 0;
  opponentName = '';
  selectedEventId = '';
  newEventNameInput = '';
  editingMatchIndex = null;
  pendingIconData = null;
  await saveData();
  showToast('リセットしました');
  location.href = 'ranking.html';
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 全角文字は2、半角文字は1としてカウントし、指定の全角文字数を超えたら「…」を付けて切り詰める
// (例: truncateZenkaku(str, 10) は全角10文字分まで表示)
function truncateZenkaku(str, maxZenkaku){
  if(!str) return '';
  const s = String(str);
  const maxWidth = maxZenkaku * 2;
  let width = 0;
  let result = '';
  for(const ch of Array.from(s)){
    const code = ch.codePointAt(0);
    const isWide = (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x20000 && code <= 0x3FFFD)
    );
    const w = isWide ? 2 : 1;
    if(width + w > maxWidth){
      result += '…';
      return result;
    }
    width += w;
    result += ch;
  }
  return result;
}

// href等に埋め込む前に http/https のURLかどうかを確認する(javascript: 等の埋め込み防止)
function isSafeHttpUrl(url){
  if(!url) return false;
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch(e){
    return false;
  }
}


// メンバー情報のチップ表示(メンバーページ・ランキングページ共通)
const DEVICE_META = {
  lever: {icon:'🕹️', label:'レバー'},
  leverless: {icon:'⌨️', label:'レバーレス'},
  pad: {icon:'🎮', label:'パッド'},
  other: {icon:'👾', label:'その他'}
};
const PLATFORM_CLASS = {PS4:'ps4', PS5:'ps5', XBOX:'xbox', Switch2:'switch2', PC:'pc'};

function deviceChipsHtml(p){
  const devices = p.devices || [];
  const chips = devices.map(d=>{
    const meta = DEVICE_META[d];
    if(!meta) return '';
    return `<span class="device-chip">${meta.icon} ${meta.label}</span>`;
  }).filter(Boolean);
  if(p.deviceName){
    chips.push(`<span class="device-chip">${escapeHtml(p.deviceName)}</span>`);
  }
  return chips.join('');
}

function platformChipsHtml(p){
  const platforms = p.platforms || [];
  return platforms.map(pf=>{
    const cls = PLATFORM_CLASS[pf] || '';
    return `<span class="platform-chip ${cls}">${escapeHtml(pf)}</span>`;
  }).join('');
}

function formatChipHtml(p){
  const formatLabel = (p.controlTypes||[]).map(t=> t==='C' ? 'クラシック' : t==='M' ? 'モダン' : t).join('/');
  return formatLabel ? `<span class="device-chip">${escapeHtml(formatLabel)}</span>` : '';
}

// 操作フォーマット・使用デバイス・メインプラットフォームのチップ行をまとめて生成
function memberMetaChipsHtml(p){
  const formatChip = formatChipHtml(p);
  const deviceRow = deviceChipsHtml(p);
  const platformRow = platformChipsHtml(p);
  if(!formatChip && !deviceRow && !platformRow) return '';
  return `<div class="member-meta-row">${formatChip}${deviceRow}${platformRow}</div>`;
}


// ページ共通の初期化処理(各ページのHTML末尾から呼び出す)
async function initPage(){
  await loadData();
  if (typeof renderCurrentPage === 'function') {
    renderCurrentPage();
  }
}
