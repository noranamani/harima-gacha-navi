# 播磨ガチャ入荷ナビ

兵庫県播磨エリアのガチャガチャ店舗について、公式X・公式店舗ページ・メーカー公式商品一覧へのリンクをまとめた非公式サイトです。

公開サイト: https://noranamani.github.io/harima-gacha-navi/

## 店舗情報の更新

- 店舗データは `stores.js` の `window.HARIMA_STORES` で管理します。
- 公式情報で確認できた店舗だけ掲載します。入荷・在庫を保証するものではありません。
- `stores.js` を更新すると、GitHub Actions が市町村別ページとサイトマップを再生成します。

## 公式リンクの週次点検

`.github/workflows/link-check.yml` により、**毎週日曜 07:15（日本時間）**に公式X・公式店舗ページ・公式商品一覧へのリンクを点検します。GitHub Actionsの **Actions → Weekly official link check → Run workflow** から手動実行もできます。

結果は実行画面の **Summary** と、ダウンロード可能な **official-link-check** アーティファクト（`link-check-latest.md`、90日保存）に記録します。

- **OK**: HTTP 2xx
- **REVIEW**: アクセス制限、タイムアウト、ネットワーク障害、その他のHTTP応答など。サイトが消えたとは限りません。
- **BROKEN_CANDIDATE**: 404/410を再試行しても検出した場合。人間による確認が必要です。

Xなどは自動アクセスを制限する場合があります。**点検結果だけで店舗を削除・リンクを変更しません。** 店舗追加やリンク修正は公式情報を確認してから行ってください。

点検はリンクの疎通確認のみで、公式サイトからの在庫・商品データの収集は行いません。
