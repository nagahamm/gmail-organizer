# 初期ルールセット

`docs/sampling-2026-08-19.md` の実測から起こした `rules` シートの初期投入分。
そのまま貼り付けられるよう、シートの列順に並べている。

`Money` / `Promo` の既存分は `importCurrentState()` が Gmail フィルタから
取り込むので、ここには**サンプリングで新たに分かった分だけ**を書く。

`@AU` の遡及付与はここではなく `migration` シートの `tag` 操作で行う。
ルール側に持たせると、行が倍に増えるうえ新着への適用と混ざるため。

---

## 求人 — ここが今回の主役

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 | メモ |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 100 | `from_domain` | `kuraveil.jp` | `Promo/Jobs/Alert` | TRUE | TRUE | 標本の 86%。実態はワーホリ斡旋の広告。**購読解除の候補** |
| TRUE | 110 | `from_domain` | `seek.com.au` | `Promo/Jobs/Alert` | TRUE | TRUE | `Australia/Employment` の 100% |
| TRUE | 120 | `from_domain` | `dm-doda.jp` | `Promo/Jobs/Agency` | TRUE | TRUE | doda スカウト |
| TRUE | 121 | `from_domain` | `lifework-doda.jp` | `Promo/Jobs/Agency` | TRUE | TRUE | doda メルマガ |
| TRUE | 122 | `from_domain` | `r-agent.com` | `Promo/Jobs/Agency` | TRUE | TRUE | **現在 `プロモーション/Cashback rewards` へ誤分類されている** |
| TRUE | 130 | `from_domain` | `ml.tcpartners.co.jp` | `Promo/Jobs/PartTime` | TRUE | TRUE | 直近 2 日で 11 通、全て未読・ラベルなしで受信トレイに滞留 |

この 6 行で求人 6,641 通の大半と、未分類で溢れていた派遣メールが片付く。

## ストア — `Australia/Stores` の中身

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 | メモ |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 200 | `from_domain` | `edm.4wdsupacentre.com.au` | `Promo/Store` | TRUE | TRUE | 標本の 56% |
| TRUE | 201 | `from_domain` | `email.rebelsport.com.au` | `Promo/Store` | TRUE | TRUE | |
| TRUE | 202 | `from_domain` | `email.jbhifi.com.au` | `Promo/Store` | TRUE | TRUE | |
| TRUE | 203 | `from_domain` | `email.everyday.com.au` | `Promo/Cashback` | TRUE | TRUE | Everyday Rewards。ストアではなくポイント案内 |

## 認証 — 現在 1 通しかない最大の穴

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 |
| --- | ---: | --- | --- | --- | --- | --- |
| TRUE | 300 | `query` | `subject:(認証コード OR 確認コード OR ワンタイム OR "verification code" OR "one-time" OR "security alert" OR "sign-in")` | `Auth/Login` | **FALSE** | **FALSE** |

`Auth` は**受信トレイに残し、既読にもしない**。OTP は見えないと困る。
`Authentication/Login` が 1 通しかないのは、認証メールが全部受信トレイに
埋もれているからで、未読 9,225 通の一因でもある。

---

## `@AU` の遡及付与は `migration` シートで行う

ワーホリは終了済みなので `@AU` は新規メールに付けない。
`migration` シートで既存ラベル配下に遡及付与するだけにする。

| 有効 | 現行ラベル | 新ラベル | 拠点 | 操作 |
| --- | --- | --- | --- | --- |
| TRUE | `Australia/Stores` | `Promo/Store` | `@AU` | `merge` |
| TRUE | `Australia/Employment` | `Promo/Jobs/Alert` | `@AU` | `merge` |
| TRUE | `Australia/Beauty` | `Promo/Beauty` | `@AU` | `rename` |
| TRUE | `Australia/Events` | `Schedule/Event` | `@AU` | `rename` |
| TRUE | `Australia/Bill` | `Money/Bill` | `@AU` | `merge` |
| TRUE | `Australia/AWX` | `Job/AWX` | `@AU` | `rename` |
| TRUE | `Australia/AWX/Payslip` | `Job/AWX/Payslip` | `@AU` | `rename` |

どうしても新着にも `@AU` を付けたい送信元が出てきた場合は、
ラベル用と拠点用でルールを 2 行に分ける。`凍結日` はルール全体を止めるので、
1 行に両方持たせると新着へのラベル付与ごと止まってしまう。

| 種別 | パターン | ラベル | 拠点 | 凍結日 | 効果 |
| --- | --- | --- | --- | --- | --- |
| `from_domain` | `example.com.au` | `Promo/Store` | (空) | (空) | 新着にラベルを付ける |
| `from_domain` | `example.com.au` | (空) | `@AU` | 移行日 | 過去メールにだけ拠点を付ける |

---

## 投入の順番

1. `importCurrentState()` で既存ラベルとフィルタを取り込む (全て `有効 = FALSE`)
2. この表を `rules` シートへ追記する
3. `DRY_RUN = TRUE` のまま「新着に適用する」を実行し、`log` を確認する
4. 問題なければ `config` の `DRY_RUN` を `FALSE` にして本適用
5. `migration` シートを埋めて移行を実行
6. 取り込んだ旧フィルタ行を、ログで一致を確認できたものから有効化 / 削除する
