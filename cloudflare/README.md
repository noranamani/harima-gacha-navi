# ガチャ公式ページ15分巡回：Cloudflare Free補助起動

## 現状と目的

GitHub ActionsのCronは15分間隔で定義されているが、実際の稼働は大幅に遅延・欠落している。Cloudflare Workers FreeのCron Triggerで別の起動経路を作る。**実際の収集・検証・本番Git保存は従来の `.github/workflows/page-updates.yml` のみ**が担当する。

GitHub Cronは維持する。Workersもベストエフォートで、15分以内の完了や100%成功を保証しない。情報源サイト側のレート制限・利用規約を回避しない。誤った入荷情報は生成しない。

## 実装済み・初期状態

- `wrangler.toml`: `7,22,37,52 * * * *`（UTC/JST同じ分）、Cron Triggerひとつ。初期状態は `GACHA_WAKEUP_ENABLED=false`。
- `cloudflare/gacha-wakeup.mjs`: REST GETで直近の同Workflow（main）の実行有無を確認。8分以内のschedule/dispatchがあればスキップ。不明・権限エラーなら新規起動しない。
- 直近実行がなければGitHub REST `workflow_dispatch` で既存Workflowのみ起動。トークンはWorker Secretに保存し、HTTP公開APIは404固定。
- `page-updates.yml` は並列コミット防止のconcurrencyを追加。外部起動時も全巡回で商品リンク差分を比較（同じ公式ページのHTTP応答を再利用し、追加GETは発生しない）。手動実行の動作は維持する。
- `scripts/page-monitor-audit.cjs`: 実際に起動した数と取得不能ページを監査し、長時間の欠落を検知する。

## 重要：Cloudflare上ではまだ未配置・無効

こちらのGitHub修正をマージしただけでは**Cloudflare Workersは稼働しない**。無料のCloudflareアカウントへのログインと秘密情報の設定が必要であり、ChatGPT/GitHub連携から秘密値は取得できない。自動で有効化したとは報告しない。

### 一度だけの設定（ローカルWindows端末、手動）

1. Cloudflare Workers Freeプランで稼働することを確認する（無料枠内なら追加料金は発生しない）。現在のFree制限はCron Trigger最大5個/アカウント、Worker自体の処理もFreeの制限に従う。
2. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokensで、リポジトリ`noranamani/harima-gacha-navi`のみに制限した、`Actions: Read and write`許可の期限付きトークンを生成する。**トークンをチャット・GitHub Issue・コミット・ログに貼らない。**
3. リポジトリのルートで `npx wrangler login` → `npx wrangler deploy` を実行（初期値 false なのでGitHub書込みは発生しない）。
4. `npx wrangler secret put GACHA_GITHUB_TOKEN` でSecretへ貼り付ける。保存時、秘密値は画面に出さない。
5. `wrangler.toml`の`GACHA_WAKEUP_ENABLED`だけ`"true"`に変更し、`npx wrangler deploy`で有効化する。**GitHubには秘密値を登録しない。**
6. Cloudflare WorkersのCronログとGitHub Actionsの`workflow_dispatch`実行を確認する。15分経過後、`data/page-status.json`の`lastCheckedAt`を照合し、商品リンク差分が実際の各巡回で比較され、追加GETが発生していないことも検証する。

### 停止・認証更新

- 停止は`GACHA_WAKEUP_ENABLED="false"`に戻してデプロイする。GitHub側のCronは引き続き動く。
- トークン失効・権限変更時はWorkerのSecretを更新する。REST取得失敗時は**安全停止**し、無効な起動を繰り返さない。
- 15分CronでもCloudflareとGitHub側の遅延はゼロにできないため、`page-monitor-health.yml`が実際の成功回数・最長空白時間を監視する。

## オフラインテスト

`node --test cloudflare/gacha-wakeup.test.mjs`

失敗系・重複防止・無効状態・権限不足・曜日を跨ぐ実行について、外部サイト接続なしで検証できる。
