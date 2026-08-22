// ===== 配信ステータス自動更新スクリプト =====
// GitHub Actions(.github/workflows/live-status.yml)から定期実行される。
// - Twitch: 公式Helix APIを使用(Client ID/Secretが必要)。認証情報はGitHub Secretsに
//   保存し、この実行環境の外には一切出さない。
// - YouTube: 自動検知は廃止。GitHub ActionsのIPのような未ログイン・匿名アクセスに対しては
//   YouTube側がエラーを出すことなく配信情報を含まないレスポンスを返すことがあり、
//   Cookie等の認証情報無しでは安定して動作しないと判断したため。
//   YouTubeで配信する場合は、マイページの「配信URL(手動)」機能を利用する。
// 結果はFirebase Realtime Databaseの live_status ノードにのみ書き込む(サービスアカウント
// 経由でセキュリティルールをバイパスして書き込むため、クライアント側からの書き込みは
// database.rules.json 側で禁止したままにできる)。

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL = 'https://classical-workers-lab-default-rtdb.asia-southeast1.firebasedatabase.app';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`::error::環境変数 ${name} が設定されていません(GitHub Secretsを確認してください)`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const serviceAccountRaw = requireEnv('FIREBASE_SERVICE_ACCOUNT');
  const twitchClientId = requireEnv('TWITCH_CLIENT_ID');
  const twitchClientSecret = requireEnv('TWITCH_CLIENT_SECRET');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (e) {
    console.error('::error::FIREBASE_SERVICE_ACCOUNT のJSONが不正です');
    process.exit(1);
  }

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  const db = getDatabase();

  const playersSnap = await db.ref('classical_worker_data/players').get();
  const players = playersSnap.val() || {};
  const names = Object.keys(players);

  const twitchTargets = names
    .filter((n) => players[n] && players[n].twitchLogin)
    .map((n) => ({ name: n, login: players[n].twitchLogin }));

  console.log(`Twitch対象: ${twitchTargets.length}件`);

  const twitchResults = await checkTwitchLive(twitchTargets, twitchClientId, twitchClientSecret);

  const now = new Date().toISOString();
  const liveStatus = {};

  // チェック対象だったメンバーは、オフラインの場合も明示的にfalseで書き込む
  // (そうしないと「配信終了」後も古いisLive:trueがずっと残ってしまう)
  twitchTargets.forEach((t) => {
    liveStatus[t.name] = { isLive: false, title: '', url: '', platform: '', thumbnail: '', updatedAt: now };
  });
  twitchResults.forEach((r) => {
    liveStatus[r.name] = {
      platform: r.platform,
      isLive: r.isLive,
      title: r.title || '',
      url: r.url || '',
      thumbnail: r.thumbnail || '',
      updatedAt: now,
    };
  });

  await db.ref('live_status').set(liveStatus);
  console.log(`live_status を更新しました(${Object.keys(liveStatus).length}件、うち配信中: ${Object.values(liveStatus).filter((v) => v.isLive).length}件)`);
  process.exit(0);
}

// ---- Twitch: 公式Helix APIで一括取得(Client Credentials認証) ----
async function getTwitchAppToken(clientId, clientSecret) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Twitchトークン取得失敗: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

async function checkTwitchLive(targets, clientId, clientSecret) {
  if (targets.length === 0) return [];
  let token;
  try {
    token = await getTwitchAppToken(clientId, clientSecret);
  } catch (e) {
    console.error(`::error::${e.message}`);
    return [];
  }

  const results = [];
  // Helix API は1リクエストにつき user_login を最大100件まで指定可能
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100);
    const params = new URLSearchParams();
    batch.forEach((t) => params.append('user_login', t.login.toLowerCase()));

    const res = await fetch(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`Twitch API呼び出し失敗: ${res.status}`);
      continue;
    }
    const json = await res.json();
    const liveByLogin = {};
    (json.data || []).forEach((s) => {
      liveByLogin[s.user_login.toLowerCase()] = s;
    });

    batch.forEach((t) => {
      const stream = liveByLogin[t.login.toLowerCase()];
      results.push({
        name: t.name,
        platform: 'twitch',
        isLive: !!stream,
        title: stream ? stream.title : '',
        url: `https://www.twitch.tv/${t.login}`,
        thumbnail: '', // Twitchはクライアント側でプレビュー画像URLを組み立てるため空のままでよい
      });
    });
  }
  return results;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
