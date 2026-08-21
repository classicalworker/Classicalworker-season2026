// ===== ローカル動作確認用サンプル =====
// このファイルをコピーして js/firebase-config.js を上書きし、
// apiKey の値だけ Firebaseコンソール(プロジェクトの設定 > 全般)で
// 確認した実際の値に置き換えてローカルで確認してください。
//
// 【重要】置き換え後の js/firebase-config.js は絶対に git add / commit しないこと。
// (.gitignore で既に除外されていますが、意図的に無視しないよう注意してください)
//
// 本番(GitHub Pages)へのデプロイ時は、このファイルではなく
// .github/workflows/deploy.yml がリポジトリの Secrets から
// 自動的にキーを注入するため、手動での書き換えは不要です。

const firebaseConfig = {
  apiKey: "ここにローカル確認用のAPIキーを貼る(コミットしないこと)",
  authDomain: "classicalworkerlab.firebaseapp.com",
  databaseURL: "https://classicalworkerlab-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "classicalworkerlab",
  storageBucket: "classicalworkerlab.firebasestorage.app",
  messagingSenderId: "1017684350339",
  appId: "1:1017684350339:web:8f6b9e208a4694adc852b6"
};

firebase.initializeApp(firebaseConfig);

window.__authReady = new Promise((resolve, reject) => {
  firebase.auth().signInAnonymously().catch((err) => {
    console.error('匿名認証に失敗しました:', err);
    reject(err);
  });
  firebase.auth().onAuthStateChanged((user) => {
    if (user) resolve(user);
  });
});
