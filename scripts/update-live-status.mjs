// ===== 配信ステータス自動更新スクリプト =====
// GitHub Actions(.github/workflows/live-status.yml)から定期実行される。
// - YouTube: /channel(または@handle)/live への通常のHTTPアクセスが最終的に
//   /watch?v=... へリダイレクトされるかどうかで配信中かを判定する(認証もCookieも不要)。
//   タイトル・サムネイルは公式の軽量な埋め込み用API(oEmbed、認証不要)から取得する。
//   ※以前はyt-dlpでページ内部の詳細情報まで取得していたが、その内部API呼び出しが
//   YouTube側の「ボットではないか確認」に引っかかりやすく、GitHub ActionsのIPからは
//   安定して動作しなかった。単純なページアクセス+oEmbedの組み合わせはこの確認に
//   引っかからないため、Cookie等の追加設定なしで安定して動作する。
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
    liveStatus[t.name] = { isLive: false, title: '', url: '', platform: '', thumbnail: '', updatedAt: now };
  });
  [...youtubeResults, ...twitchResults].forEach((r) => {
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

// ---- YouTube: 通常のHTTPアクセスのみで配信有無を判定(認証・Cookie不要) ----

const YOUTUBE_FETCH_TIMEOUT_MS = 10_000; // 1件あたりの上限。無いと応答待ちでジョブ全体が詰まる。
const YOUTUBE_CONCURRENCY = 6;

// タイムアウト付きfetch
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

// UCxxxx形式のチャンネルIDか、@ハンドル形式かを判定してYouTube上のURLを組み立てる。
// 万一データに古い壊れた値(URLがそのまま入っている等)が残っていても、可能な範囲で救済する。
function buildYoutubeLiveUrl(channelId) {
  const trimmed = String(channelId).trim();
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}/live`;
  }
  const handleMatch = trimmed.match(/(@[0-9A-Za-z_.-]{3,})/);
  if (handleMatch) {
    return `https://www.youtube.com/${handleMatch[1]}/live`;
  }
  // 何かのURLがそのまま入っている場合は、末尾に/liveを付けて試す
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '').replace(/\/(live|videos|streams|featured)$/i, '') + '/live';
  }
  return `https://www.youtube.com/channel/${encodeURIComponent(trimmed)}/live`;
}

const YOUTUBE_UA = 'Mozilla/5.0 (compatible; ClassicalWorkerLabBot/1.0)';

async function checkYoutubeOne(t) {
  const liveUrl = buildYoutubeLiveUrl(t.channelId);
  try {
    // /channel(または@handle)/live は、配信中なら最終的に /watch?v=... へリダイレクトされる。
    // 配信していなければチャンネルのトップページ等に留まる。この違いだけで判定するので、
    // ページ本文を正規表現でパースする必要が無く、無関係な動画を誤って拾う心配もない。
    const res = await fetchWithTimeout(
      liveUrl,
      {
        redirect: 'follow',
        headers: { 'User-Agent': YOUTUBE_UA, 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8' },
      },
      YOUTUBE_FETCH_TIMEOUT_MS
    );

    const finalUrl = res.url || liveUrl;
    const videoIdMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const isLive = res.ok && /\/watch\?/.test(finalUrl) && !!videoIdMatch;

    if (!isLive) {
      console.log(`YouTube(${t.name}): isLive=false status=${res.status} finalUrl=${finalUrl}`);
      return { name: t.name, platform: 'youtube', isLive: false, title: '', url: '', thumbnail: '' };
    }

    const url = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;

    // タイトル・サムネイルは公式のoEmbed(認証不要・埋め込みウィジェット用の軽量API)から取得する。
    // 失敗しても配信中であること自体は分かっているので、その場合はタイトル・サムネイル無しで返す。
    let title = '';
    let thumbnail = '';
    try {
      const oembedRes = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { headers: { 'User-Agent': YOUTUBE_UA } },
        YOUTUBE_FETCH_TIMEOUT_MS
      );
      if (oembedRes.ok) {
        const info = await oembedRes.json();
        title = info.title || '';
        thumbnail = info.thumbnail_url || '';
      } else {
        console.warn(`YouTube(${t.name}): oEmbed取得失敗 HTTP ${oembedRes.status}`);
      }
    } catch (e) {
      console.warn(`YouTube(${t.name}): oEmbed取得失敗 ${e.message}`);
    }

    console.log(`YouTube(${t.name}): isLive=true title="${title}" url=${url}`);
    return { name: t.name, platform: 'youtube', isLive: true, title, url, thumbnail };
  } catch (e) {
    const reason = e.name === 'AbortError' ? `タイムアウト(${YOUTUBE_FETCH_TIMEOUT_MS}ms)` : e.message;
    console.warn(`YouTubeチェック失敗(${t.name}): ${reason} url=${liveUrl}`);
    return { name: t.name, platform: 'youtube', isLive: false, title: '', url: '', thumbnail: '' };
  }
}

async function checkYoutubeLive(targets) {
  return runWithConcurrency(targets, YOUTUBE_CONCURRENCY, checkYoutubeOne);
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
