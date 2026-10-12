// 応援パック（有料の追加分）の設定
// enabled を true にすると、ホームに「応援パック」が出る。
// 解除コードは tools/make_code.js で作り、出てきた「ハッシュ」を codeHashes に入れる（コードそのものは書かない）。
window.OEN = {
  enabled: false,
  name: "応援パック",
  price: "500円",
  buyUrl: "",            // BOOTH などの販売ページのURL
  benefits: [
    "結果画面の広告が消えます",
    "配線図・図記号の問題（40問）が解けます",
    "写真で見分ける問題（開発中）も、できしだい追加されます"
  ],
  codeHashes: []
};
