// ===== 配信ステータス自動更新スクリプト =====
// GitHub Actions(.github/workflows/live-status.yml)から定期実行される。
// - YouTube: yt-dlp(要ワークフロー側でインストール)を使ってライブ配信の有無・タイトル・
//   サムネイルを取得する。以前は自前でHTMLを正規表現パースしていたが、YouTube側のページ構造の
//   揺れ(コンセント確認・フォールバック表示など)により無関係な動画を誤って拾う不具合が
//   繰り返し発生したため、YouTube配信検出用に広く使われ継続的にメンテナンスされているOSSの
//   yt-dlpに置き換えた。
// - Twitch: 公式Helix APIを使用(Client ID/Secretが必要)。認証情報はGitHub Secretsに
//   保存し、この実行環境の外には一切出さない。
// 結果はFirebase Realtime Databaseの live_status ノードにのみ書き込む(サービスアカウント
// 経由でセキュリティルールをバイパスして書き込むため、クライアント側からの書き込みは
// database.rules.json 側で禁止したままにできる)。

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
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

// ---- YouTube: yt-dlpでライブ配信の有無・タイトル・サムネイルを取得 ----

const YOUTUBE_YTDLP_TIMEOUT_MS = 20_000; // yt-dlp起動+解析の上限。これが無いと応答待ちでジョブ全体が詰まる。
const YOUTUBE_CONCURRENCY = 4;           // プロセス起動を伴うため、HTML直接取得の時より並列数はやや控えめにする。

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

async function checkYoutubeOne(t) {
  const liveUrl = buildYoutubeLiveUrl(t.channelId);
  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      [
        '--skip-download',
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout', '10',
        // GitHub ActionsなどクラウドIPからのアクセスはYouTube側の「ボット確認」に
        // 引っかかりやすいため、その確認を要求されにくいTVクライアント扱いで取得する。
        '--extractor-args', 'youtube:player_client=tv',
        '--dump-single-json',
        liveUrl,
      ],
      { timeout: YOUTUBE_YTDLP_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
    );

    const info = JSON.parse(stdout);
    let isLive = info.is_live === true || info.live_status === 'is_live';

    // 登録がUC形式のチャンネルIDの場合、取得した動画が本当にそのチャンネルのものかも照合する。
    // (yt-dlpは基本的に対象チャンネルの配信を正しく解決するが、念のための二重チェック)
    if (isLive && info.channel_id && /^UC[0-9A-Za-z_-]{20,}$/.test(t.channelId) && info.channel_id !== t.channelId) {
      console.warn(
        `YouTube(${t.name}): 取得動画のチャンネルIDが不一致のため無効化 (期待=${t.channelId} 実際=${info.channel_id})`
      );
      isLive = false;
    }

    const title = isLive ? (info.title || '') : '';
    const url = isLive ? (info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`) : '';
    const thumbnail = isLive ? (info.thumbnail || '') : '';

    console.log(`YouTube(${t.name}): isLive=${isLive} title="${title}" url=${url}`);
    return { name: t.name, platform: 'youtube', isLive, title, url, thumbnail };
  } catch (e) {
    // 「配信なし」判定だった場合も、実際は取得自体に失敗している(ボット判定等)ケースを
    // 見分けられるよう、常に生のエラー内容を短く出力しておく。
    const stderrText = (e.stderr || e.message || '').toString();
    const notLive = /not currently live|does not have a live stream|no video formats|Premieres in|This live event will begin|is not currently live/i.test(
      stderrText
    );
    const reason = e.killed ? `タイムアウト(${YOUTUBE_YTDLP_TIMEOUT_MS}ms)` : stderrText.replace(/\s+/g, ' ').trim().slice(0, 300) || e.message;
    if (notLive) {
      console.log(`YouTube(${t.name}): isLive=false (配信なしと判定) raw="${reason}"`);
    } else {
      console.warn(`YouTubeチェック失敗(${t.name}): ${reason} url=${liveUrl}`);
    }
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
