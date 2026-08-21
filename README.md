# Classical Worker's Lab — サイト構成(多ページ版)

## ディレクトリ構成

```
site/
├── index.html      … TOP(各タブの要点をまとめたダッシュボード)
├── schedule.html   … 予定(予定の追加・出席確認・カレンダー・過去の大会記録)
├── goals.html      … 目標
├── ranking.html    … ランキング
├── members.html    … メンバー
├── mypage.html     … マイページ
├── css/
│   └── style.css   … 全ページ共通スタイル
├── js/
│   ├── firebase-config.js … Firebase接続設定(公開先を変える場合はここだけ差し替え)
│   ├── core.js             … 全ページ共通ロジック(データ読み書き・トースト表示・モーダル等)
│   ├── top.js                … TOPページ専用ロジック
│   ├── schedule.js           … 予定ページ専用ロジック
│   ├── goals.js              … 目標ページ専用ロジック
│   ├── ranking.js            … ランキングページ専用ロジック
│   ├── members.js            … メンバーページ専用ロジック
│   └── mypage.js             … マイページ専用ロジック
├── assets/          … 画像などの静的ファイル用(現状は空)
├── scripts/
│   └── update-live-status.mjs … YouTube/Twitchの配信中判定をFirebaseに書き込むスクリプト
│                                  (GitHub Actionsから定期実行。サイト自体では読み込まない)
├── package.json     … 上記スクリプト用の依存関係定義(サイト本体には無関係)
├── .github/workflows/
│   ├── deploy.yml       … GitHub Pagesへのデプロイ
│   └── live-status.yml  … 配信ステータス自動更新(10分おき)
└── README.md
```

## 何が変わったか(前回のSPA版との違い)

前回はタブ切替がJavaScriptによる「同じページ内での表示/非表示切替」でしたが、
今回は**タブ=実ページ**になりました。タブをクリックすると本当に別のHTMLファイルへ
遷移し、ブラウザのアドレスバーのURLも `index.html` → `ranking.html` のように変わります。
これにより、一般的なWebサイトと同じ感覚で「戻る/進む」やURL共有ができます。

JavaScriptは「全ページ共通で使うもの」(`core.js`)と「そのページでしか使わないもの」
(`notice.js`など)に分けています。共通部分をむやみに重複させず、各ページの見通しも
良くなるようにしています。

### ページ間の遷移について

- ナビゲーションタブは `<a href="...">` の通常のリンクです
- マイページやメンバー一覧から大会名バッジをクリックした場合は、
  `index.html?openDate=2026-08-17` のようにURLパラメータを付けて
  お知らせページへ遷移し、該当日の詳細を自動的に開きます
- 「全データをリセット」ボタンを押すと、処理後に `ranking.html` へ遷移します

### 状態(選んでいるプレイヤーなど)の扱いについて

ページ遷移するたびに(ブラウザで別ページを開くのと同じなので)JavaScript上の
一時的な状態はリセットされます。これは元のアプリでもタブを切り替えるたびに
同様のリセットが行われていたため、動作上の違いはありません。
対戦成績・目標・ランキングなどのデータ自体はFirebaseに保存されているので、
ページ遷移しても消えることはありません。

## GitHub Pagesでの公開手順

1. GitHubで新しいリポジトリを作成する
2. `site/`フォルダの中身をリポジトリ直下にアップロード
3. リポジトリの **Settings → Pages** を開く
4. Source を「Deploy from a branch」、Branch を `main` / `(root)` に設定して保存
5. 数分後、`https://ユーザー名.github.io/リポジトリ名/` で公開される
   (`index.html` はTOPページ、予定は `schedule.html` になります)

## 今後の拡張(管理ページ・パスワード付き個人ページ)について

GitHub Pagesは静的ファイルのみのホスティングのため、サーバー側でパスワードを
検証する仕組みは作れません。今後「管理ページ」や「パスワード付き個人ページ」を
追加する場合は、次のいずれかの方法が現実的です。

- **Firebase Authentication** を使う(このプロジェクトは既にFirebaseを使っているため相性が良い)
  - メンバーごとにログイン(メール/パスワードなど)させ、ログイン状態に応じて
    `admin.html` や個人ページの表示・書き込み権限をFirebaseのセキュリティルールで制御する
  - 今の構成のまま、`admin.html` のようなページを1つ追加し、
    共通の`css/style.css`・`js/core.js`を読み込む形にすれば拡張できる
- 簡易的な合言葉程度でよい場合は、クライアント側JSでの簡易ロックも可能だが、
  ブラウザの開発者ツールで中身が見えてしまうため「本当の意味でのパスワード保護」にはならない点は留意してください

このあたりを実装する際は、要望を教えていただければ続けて作成します。

## 注意: Firebase設定について

`js/firebase-config.js` 内の`apiKey`はFirebaseの仕組み上、公開しても問題ない値です。
ただし、データの読み書き権限は Firebase側の「Realtime Databaseのルール」で
制御されているため、公開前にFirebaseコンソールでルールが意図した設定になっているか
確認することをおすすめします。

## セキュリティ設定(必須・初回のみ)

以前の構成では Realtime Database に認証なしで誰でも読み書きできる状態だったため、
GitHubのSecret Scanningアラートおよび Google Cloud Platform 側での不正利用検知
(プロジェクト停止)につながりました。以下の手順をすべて実施してください。

### 1. 漏洩したAPIキーの失効・再発行

過去にリポジトリへ平文でコミットされていたAPIキーは、コミット履歴に残っている限り
無効化しない限りリスクが残ります。

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   「APIとサービス」→「認証情報」を開く
2. 該当のAPIキーを**削除して新規作成**するか、既存キーを再生成する
3. Firebaseコンソール側の設定 (`js/firebase-config.js` の `apiKey`) も新しい値に更新する
   (下記の通り、実際の値はリポジトリに直接コミットしない)

### 2. APIキーに制限をかける

同じ画面でキーを選択し、以下を設定してください。

- **アプリケーションの制限**: 「HTTPリファラー」を選択し、
  `https://ユーザー名.github.io/*` など、実際に公開するドメインのみ許可
- **APIの制限**: 「キーを制限」を選択し、このサイトで実際に使う
  `Identity Toolkit API`(匿名認証用)と `Firebase Realtime Database API` のみ許可

### 3. Realtime Databaseのセキュリティルールを設定

リポジトリ直下の `database.rules.json` の内容を、Firebaseコンソールの
「Realtime Database → ルール」タブに貼り付けて公開してください。
未認証ユーザーからの読み書きを拒否し、匿名認証済みのユーザーのみ許可する内容です。

### 4. GitHub Secretsにキーを登録(平文コミットを防止)

`js/firebase-config.js` の `apiKey` は `__FIREBASE_API_KEY__` というプレースホルダの
状態でコミットされています。実際の値はリポジトリの Secrets にのみ保存し、
`.github/workflows/deploy.yml` がGitHub Pagesへのデプロイ時に自動で埋め込みます。

1. リポジトリの **Settings → Secrets and variables → Actions** を開く
2. 「New repository secret」から `FIREBASE_API_KEY` という名前で、
   手順1で再発行した新しいAPIキーを登録する
3. Settings → Pages の Source を「GitHub Actions」に変更する
   (「Deploy from a branch」のままだとワークフローが使われず、
   プレースホルダのまま公開されてしまいます)
4. `main` ブランチにpushすると、ワークフローが自動でキーを埋め込んで公開します

これにより、GitHubのSecret Scanningが平文キーを検出することはなくなります。
ローカルで動作確認したい場合は `js/firebase-config.local.example.js` を参考にし、
実キーを書いたファイルは**絶対にコミットしない**でください。

### 5. (推奨)Firebase App Checkの有効化

より強固に「正規のこのサイトからのアクセスだけ」に絞りたい場合は、
Firebaseコンソールの「App Check」でreCAPTCHA v3を有効化し、
`firebase-app-check-compat.js` を読み込んで初期化することを推奨します。
これにより、APIキーとURLだけを知っている第三者からの機械的なアクセスを
さらに防ぎやすくなります(このリポジトリには未実装のため、必要であれば追加作業として対応可能です)。

### 5.5 配信ステータス自動更新(YouTube/Twitchの「配信中」を自動検知)

TOP画面の「NOW ON AIR」を、メンバーが配信のたびにURLを貼り直さなくても自動表示できる
仕組みです。GitHub Actionsが5〜10分おきにYouTube/Twitchをチェックし、結果だけを
Firebaseの `live_status` ノードに書き込みます(ブラウザ側にAPIキー等は一切出しません)。
使わない場合はこの手順を飛ばしても、従来通り「配信URL(手動)」欄でTOP画面に表示できます。

1. **Twitchの認証情報を取得する**
   1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) にログインし、
      「Register Your Application」から新規アプリを作成する(名前は任意、
      OAuth Redirect URLsは `https://localhost` などダミーでよい、
      Category は「Application Integration」)
   2. 作成後、表示される **Client ID** をメモする
   3. 「New Secret」ボタンから **Client Secret** を発行してメモする
      (この画面を閉じると二度と表示されないので、その場でコピーしておくこと)
2. **Firebaseのサービスアカウントキーを取得する**
   1. [Firebaseコンソール](https://console.firebase.google.com/) → 対象プロジェクト →
      歯車アイコン → 「プロジェクトの設定」→ 「サービス アカウント」タブを開く
   2. 「新しい秘密鍵の生成」をクリックし、ダウンロードされたJSONファイルの中身を
      そのままコピーしておく(このJSONは強い権限を持つため、リポジトリには
      絶対にコミットしないこと)
3. **GitHub Secretsに登録する**
   - リポジトリの **Settings → Secrets and variables → Actions** を開き、
     「New repository secret」から以下の3つを追加する

     | Name | 値 |
     |---|---|
     | `TWITCH_CLIENT_ID` | 手順1でメモしたClient ID |
     | `TWITCH_CLIENT_SECRET` | 手順1でメモしたClient Secret |
     | `FIREBASE_SERVICE_ACCOUNT` | 手順2でダウンロードしたJSONファイルの中身をそのまま貼り付け |

4. **Realtime Databaseのルールを更新する**
   - `database.rules.json` に `live_status` ノードのルールを追加済みなので、
     Firebaseコンソールの「Realtime Database → ルール」タブに、このリポジトリの
     `database.rules.json` の最新の内容を貼り付けて公開し直す
   - `live_status` は `.write: false` にしてあるため、ブラウザからは読み取り専用。
     書き込みはGitHub Actions上のサービスアカウント(セキュリティルールを
     バイパスする特別な権限)からのみ行われる
5. **メンバー側の設定**
   - マイページの「YouTubeチャンネルID」または「Twitchログイン名」に、
     各メンバーが自分のチャンネルIDまたはログイン名を一度だけ登録する
   - チャンネルIDはYouTubeのチャンネルURL(`youtube.com/channel/UCxxxx...`)や
     YouTube Studioの「設定 → チャンネル → 詳細設定」で確認できる
   - 登録後は、配信を開始するだけで(5〜10分以内に)TOP画面に自動反映される。
     手動で毎回URLを貼り直す必要はない
6. 動作確認は、リポジトリの **Actions** タブ → 「配信ステータス自動更新」→
   「Run workflow」から手動実行できる

> 補足:GitHub Pages/Actionsは静的サイト向けの無料枠でも十分動く構成ですが、
> パブリックリポジトリの場合、60日間そのリポジトリへの操作(push等)がないと
> スケジュール実行が自動的に一時停止する仕様があります。その場合はActionsタブから
> 手動実行するか、何かしらpushすれば再開します。

### 6. Google Cloudプロジェクトの停止解除の申し立て

上記1〜5を実施した上で、GCPの「異議を申し立てる」フォームに以下を記載してください。

- **原因**: `firebase-config.js` にAPIキーを平文でコミットし、GitHub上で公開状態になっていた。加えてRealtime Databaseのルールが未認証でも読み書き可能な設定になっており、第三者による不正アクセス・不正利用を招いた可能性がある
- **対策**: 該当キーの失効・再発行、キーへのHTTPリファラー/API制限の付与、Realtime Databaseルールの認証必須化、GitHub Actionsによるビルド時キー注入への移行(平文コミットの廃止)
- **第三者の不正利用**: 漏洩したキーが第三者に悪用された可能性がある旨
