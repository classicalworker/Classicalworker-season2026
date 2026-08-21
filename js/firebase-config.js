// ===== Firebase設定 =====
// 【重要】このファイルに生のAPIキーを直接書かないこと。
// __FIREBASE_API_KEY__ などのプレースホルダは、GitHub Actionsのビルド時に
// リポジトリの Secrets (Settings > Secrets and variables > Actions) から
// 自動的に置き換えられます。ローカルで動作確認する場合は
// js/firebase-config.local.js (.gitignore済み) を別途作成してください。
// 詳しい手順は README.md の「セキュリティ設定」を参照。
const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "classicalworkerlab.firebaseapp.com",
  databaseURL: "https://classicalworkerlab-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "classicalworkerlab",
  storageBucket: "classicalworkerlab.firebasestorage.app",
  messagingSenderId: "1017684350339",
  appId: "1:1017684350339:web:8f6b9e208a4694adc852b6"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);

// ===== 匿名認証 =====
// データベースのセキュリティルールで `auth != null` を必須にするための下準備。
// これにより、APIキー単体を知っているだけの第三者が
// 素のREST APIから直接データを読み書きすることを防ぎやすくなります
// (Firebase JS SDK経由のサインインが必要になるため)。
// core.js 側はこの Promise を待ってからデータベースにアクセスします。
window.__authReady = new Promise((resolve, reject) => {
  firebase.auth().signInAnonymously().catch((err) => {
    console.error('匿名認証に失敗しました:', err);
    reject(err);
  });
  firebase.auth().onAuthStateChanged((user) => {
    if (user) resolve(user);
  });
});
