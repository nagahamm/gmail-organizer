# gmail-organizer

Gmail のラベル振り分けを Google スプレッドシートで一元管理し、Google Apps Script で
自動適用・ログ記録し、週次で AI が改善提案を出す仕組み。

受信トレイ 11,642 通 / 未読 9,225 通、ユーザー定義ラベル 39 個という状態からの出発点
(2026-08-19 時点)。

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [`docs/design.md`](docs/design.md) | 現状分析・アーキテクチャ・シート構成・サービス選定 |
| [`docs/constraints.md`](docs/constraints.md) | Gmail / GAS / 設計上の制約。**実装前に必ず読む** |
| [`docs/naming.md`](docs/naming.md) | ラベルの体系 (大項目 14 と中項目の切り方) と命名規約 |
| [`docs/senders.md`](docs/senders.md) | 送信元カタログ (運営元 → サービス → 送信元) |
| [`docs/requirements.md`](docs/requirements.md) | 振る舞いの要件 (Gherkin)。**機能変更の着手前にここを更新する** |
| [`docs/initial-rules.md`](docs/initial-rules.md) | `rules` シートへ貼る初期ルール |
| [`CLAUDE.md`](CLAUDE.md) | 設計の決定事項・開発の進め方・コミット規約 |

列の定義は `src/schema.ts` が唯一の置き場です。ドキュメントには再掲しません。

## 導入

```bash
npm install
npx clasp login                       # 初回のみ
npx clasp create --type sheets \
  --title "Gmail Label DB" --rootDir src
npm run push                          # src/ を GAS プロジェクトへ反映
npx clasp open
```

`.clasp.json` の `scriptId` は各自の GAS プロジェクト ID。**コミットしない**
(`.gitignore` 済み)。

スプレッドシートを開くと **gmail-organizer** メニューが出る。上から順に実行する。

| # | メニュー | 内容 |
| --- | --- | --- |
| 1 | シートを作成 / 更新 | `labels` / `rules` / `senders` / `log` / `log_archive` / `unmatched` / `proposals` / `config` を生成 |
| 2 | 現在のラベルとフィルタを取り込む | 既存 39 ラベルと Gmail フィルタをシートへ。**手入力は不要** |

## 安全側の既定

- **`DRY_RUN` は既定で有効**。ラベルは変更せず `log` シートに `dry_run` として記録するだけ。
  `config` シートの `DRY_RUN` を `FALSE` にすると本適用になる
- 取り込んだルールは全て `有効 = FALSE`。人が確認するまで何も適用されない
- ラベルの削除は提案のみ。実削除は人間が Gmail 上で行う

## 開発

```bash
npm run typecheck   # tsc --noEmit
npm test            # 振る舞いの検証
npm run push        # clasp push
```

`npm test` は `docs/requirements.md` のシナリオのうち、GAS API に触れずに
検証できるものを Node で回す。仕組みは `docs/design.md` 5.4 にある。
