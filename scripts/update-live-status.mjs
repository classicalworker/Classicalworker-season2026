// ===== 配信ステータス自動更新スクリプト =====
// GitHub Actions(.github/workflows/live-status.yml)から定期実行される。
// - YouTube: 公式APIキー不要。/channel/{ID}/live ページをサーバー側から取得し、
//   ライブ配信中かどうか・タイトルをHTMLから読み取る(CORSはブラウザのみの制約なので問題なし)。
// - Twitch: 公式Helix APIを使用(Client ID/Secretが必要)。認証情報はGitHub Secretsに
//   保存し、この実行環境の外には一切出さない。
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

  const youtubeTargets = names
    .filter((n) => players[n] && players[n].youtubeChannelId)
    .map((n) => ({ name: n, channelId: players[n].youtubeChannelId }));
  const twitchTargets = names
    .filter((n) => players[n] && players[n].twitchLogin)
    .map((n) => ({ name: n, login: players[n].twitchLogin }));

  console.log(`YouTube対象: ${youtubeTargets.length}件 / Twitch対象: ${twitchTargets.length}件`);

  const [youtubeResults, twitchResults] = await Promise.all([
    checkYoutubeLive(youtubeTargets),
    checkTwitchLive(twitchTargets, twitchClientId, twitchClientSecret),
  ]);

  const now = new Date().toISOString();
  const liveStatus = {};

  // チェック対象だったメンバーは、オフラインの場合も明示的にfalseで書き込む
  // (そうしないと「配信終了」後も古いisLive:trueがずっと残ってしまう)
  [...youtubeTargets, ...twitchTargets].forEach((t) => {
    liveStatus[t.name] = { isLive: false, title: '', url: '', platform: '', updatedAt: now };
  });
  [...youtubeResults, ...twitchResults].forEach((r) => {
    liveStatus[r.name] = {
      platform: r.platform,
      isLive: r.isLive,
      title: r.title || '',
      url: r.url || '',
      updatedAt: now,
    };
  });

  await db.ref('live_status').set(liveStatus);
  console.log(`live_status を更新しました(${Object.keys(liveStatus).length}件、うち配信中: ${Object.values(liveStatus).filter((v) => v.isLive).length}件)`);
  process.exit(0);
}

// ---- YouTube: /channel/{ID}/live をサーバー側から取得して判定(APIキー不要) ----

const YOUTUBE_FETCH_TIMEOUT_MS = 10_000; // 1件あたりの上限。これが無いとYouTube側の応答待ちで
                                          // ジョブ全体が数十分単位で詰まる原因になっていた。
const YOUTUBE_CONCURRENCY = 6;           // 直列実行(1件ずつ)をやめて並列化し、全体時間を短縮する。

// タイムアウト付きfetch。指定時間内にレスポンスが無ければ中断してnullを返す。
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 配列を指定した並列数のチャンクに分けて処理する簡易ワーカープール
async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  async function runNext() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

async function checkYoutubeOne(t) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/channel/${encodeURIComponent(t.channelId)}/live`,
      {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClassicalWorkerLabBot/1.0)',
          'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
          // 地域によってはCookie同意ページにリダイレクトされ、配信状況が全く読み取れなくなるため
          // あらかじめ同意済み状態を送って回避する。
          Cookie: 'CONSENT=YES+1; SOCS=CAI',
        },
      },
      YOUTUBE_FETCH_TIMEOUT_MS
    );

    if (!res.ok) {
      console.warn(`YouTube取得失敗(${t.name}): HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    const isLive = /"isLiveNow":\s*true/.test(html) || /itemprop="isLiveBroadcast"\s+content="True"/i.test(html);

    let title = '';
    const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
    }

    let url = `https://www.youtube.com/channel/${t.channelId}/live`;
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]*)"/);
    if (canonicalMatch) url = canonicalMatch[1];

    console.log(`YouTube(${t.name}): isLive=${isLive} title="${title}"`);
    return { name: t.name, platform: 'youtube', isLive, title, url };
  } catch (e) {
    const reason = e.name === 'AbortError' ? `タイムアウト(${YOUTUBE_FETCH_TIMEOUT_MS}ms)` : e.message;
    console.warn(`YouTubeチェック失敗(${t.name}): ${reason}`);
    return null;
  }
}

async function checkYoutubeLive(targets) {
  const results = await runWithConcurrency(targets, YOUTUBE_CONCURRENCY, checkYoutubeOne);
  return results.filter(Boolean);
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
      });
    });
  }
  return results;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
