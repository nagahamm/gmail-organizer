# gmail-organizer

Gmail のラベル振り分けを Google スプレッドシートで一元管理し、Google Apps Script で
自動適用・ログ記録し、週次で AI が改善提案を出す仕組み。

受信トレイ 11,642 通 / 未読 9,225 通、ユーザー定義ラベル 39 個という状態からの出発点
(2026-08-19 時点)。

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [`docs/design.md`](docs/design.md) | 現状分析・アーキテクチャ・シートのスキーマ・サービス選定 |
| [`docs/label-migration.md`](docs/label-migration.md) | 現行 39 ラベル → 新体系の移行マッピング (**要レビュー**) |
| [`CLAUDE.md`](CLAUDE.md) | 設計の決定事項・開発の進め方・コミット規約 |

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
| 1 | シートを作成 / 更新 | `labels` / `rules` / `log` / `unmatched` / `proposals` / `sampling` / `config` を生成 |
| 2 | 現在のラベルとフィルタを取り込む | 既存 39 ラベルと Gmail フィルタをシートへ。**手入力は不要** |
| 3 | 移行前の実態を調査する | `docs/label-migration.md` の要判断ポイントを実データで確認 |

3 の結果を見てから移行マッピングを確定し、`rules` を有効化する。

## 安全側の既定

- **`DRY_RUN` は既定で有効**。ラベルは変更せず `log` シートに `dry_run` として記録するだけ。
  `config` シートの `DRY_RUN` を `FALSE` にすると本適用になる
- 取り込んだルールは全て `有効 = FALSE`。人が確認するまで何も適用されない
- ラベルの削除は提案のみ。実削除は人間が Gmail 上で行う

## 開発

```bash
npm run typecheck   # tsc --noEmit
npm run push        # clasp push
```

照合ロジックはメニューの「照合ロジックの自己テスト」(`runMatcherSelfTest`) から
GAS 上で検証できる。
