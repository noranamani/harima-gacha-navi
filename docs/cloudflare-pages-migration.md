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
- /data/page-status.json と /data/product-links-history.json の200応答・JSON内容・更新時刻をGitHub mainと比較。15分巡回後、Pagesの再ビルドなしで反映されることを確認する（上流キャッシュやActions遅延を含む）。
- 新着8時間、地域絞り込み、お気に入り、公式リンク、旧GitHub Pages、noteの動作を確認。
- Free利用量を確認。Pages FunctionsはJSON2経路のみ、静的ページは対象外。公開GitHub rawを固定取得先とし、60秒のキャッシュ設定を使う。上流側のキャッシュ・利用制限は別に存在する。取得不能時は503を返し、古いビルド時データで新着を誤表示しない。アクセスが増えたら認証付きKV等の更新方式を別途検討。
- noindex解除・canonical・sitemap・Search Console・noteリンクの切替は公開確認後に別PRで実施する。既存GitHub Pagesの停止は行わない。
