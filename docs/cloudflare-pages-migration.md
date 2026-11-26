# Cloudflare Pages 並行稼働（広告掲載前の検証）

現行 GitHub Pages・15分巡回・note を維持する。Cloudflare側は別サイトで公開し、切替承認まで noindex・旧canonicalを維持。広告コード、ads.txt、公開URLの切替はまだ行わない。

## 一度だけのCloudflareダッシュボード設定（Free）

Workers & Pages > Create > Pages > Connect to Git を選び、noranamani/harima-gacha-navi を選択。
- Project name: harima-gacha-navi（空いている場合）
- Production branch: main
- Framework preset: None
- Build command: node scripts/build-cloudflare-pages.cjs
- Build output directory: dist-cloudflare
- Root directory: リポジトリルート（空欄）
- Preview branch: None（無効）
- Build watch paths: Include = *; Exclude = data/*, note/*, docs/*, .github/*, cloudflare/*, wrangler.toml
  （データのみのpushではビルドしない。ソース変更時だけビルドする。）
既存の harima-gacha-wakeup Worker やそのトークン設定は変更不要。PagesをWorkers Paidへ変更しない。

## 検証
- Node: node --test scripts/cloudflare-parallel.test.cjs
- Cloudflareの公開URLが実際に発行されたらトップ、神戸市西区、商品差分画面を確認。
- /data/page-status.json と /data/product-links-history.json の302リダイレクト先（固定のGitHub raw）、最終200応答・CORS・JSON内容・更新時刻をGitHub mainと比較。15分巡回後、Pagesの再ビルドなしで反映されることを確認する（上流キャッシュやActions遅延を含む）。
- 新着8時間、地域絞り込み、お気に入り、公式リンク、旧GitHub Pages、noteの動作を確認。
- Free利用量を確認。公開JSONは固定URLへの静的302リダイレクトでブラウザが取得する。Pages Functionsの上流接続が両経路で失敗したため廃止した。静的配信のままなのでFunctions枠を使わない。GitHub rawのキャッシュ・利用制限は別に存在するため、アクセス増加時は別途データ配信方式を検討する。
- noindex解除・canonical・sitemap・Search Console・noteリンクの切替は公開確認後に別PRで実施する。既存GitHub Pagesの停止は行わない。
