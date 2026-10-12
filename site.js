// アプリ全体の設定
// reportUrl に Googleフォームなどの URL を入れると、問題画面に「この問題の誤りを報告」が出る。
// URL の中に {id} と書くと、その問題の id に置き換わる（Googleフォームの「事前入力したURL」で使う）。
window.SITE = {
  reportUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfpHXISEu03y1-7VdYza-1llj0_aFQstwUAsNMev_dCeYLyAA/viewform?usp=pp_url&entry.1509870399={id}",
  // GoatCounterのサイトコード（例: "denko2"）。https://denko2.goatcounter.com/count に計測する。
  // 空文字なら無効。http/httpsで公開したときだけ動き、file://では読み込まない。
  goatcounter: "denko2",
  // Cloudflare Web Analyticsの管理画面で取得したトークン。空文字なら無効。
  cfBeacon: ""
};
