# 初期ルールセット

`docs/sampling-2026-08-19.md` の実測から起こした `rules` シートの初期投入分。
そのまま貼り付けられるよう、シートの列順に並べている。

`Finance` / `Promotions` の既存分は `importCurrentState()` が Gmail フィルタから
取り込むので、ここには**サンプリングで新たに分かった分だけ**を書く。

`@AU` の遡及付与はここではなく `migration` シートの `tag` 操作で行う。
ルール側に持たせると、行が倍に増えるうえ新着への適用と混ざるため。

---

## 求人 — ここが今回の主役

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 | メモ |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 100 | `from_domain` | `kuraveil.jp` | `Promotions/Jobs/Alerts` | TRUE | TRUE | 標本の 86%。実態はワーホリ斡旋の広告。**購読解除の候補** |
| TRUE | 110 | `from_domain` | `seek.com.au` | `Promotions/Jobs/Alerts` | TRUE | TRUE | `Australia/Employment` の 100% |
| TRUE | 120 | `from_domain` | `dm-doda.jp` | `Promotions/Jobs/Agencies` | TRUE | TRUE | doda スカウト |
| TRUE | 121 | `from_domain` | `lifework-doda.jp` | `Promotions/Jobs/Agencies` | TRUE | TRUE | doda メルマガ |
| TRUE | 122 | `from_domain` | `r-agent.com` | `Promotions/Jobs/Agencies` | TRUE | TRUE | **現在 `プロモーション/Cashback rewards` へ誤分類されている** |
| TRUE | 130 | `from_domain` | `ml.tcpartners.co.jp` | `Promotions/Jobs/Temp` | TRUE | TRUE | 直近 2 日で 11 通、全て未読・ラベルなしで受信トレイに滞留 |

この 6 行で求人 6,641 通の大半と、未分類で溢れていた派遣メールが片付く。

## ストア — `Australia/Stores` の中身

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 | メモ |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 200 | `from_domain` | `edm.4wdsupacentre.com.au` | `Promotions/Stores` | TRUE | TRUE | 標本の 56% |
| TRUE | 201 | `from_domain` | `email.rebelsport.com.au` | `Promotions/Stores` | TRUE | TRUE | |
| TRUE | 202 | `from_domain` | `email.jbhifi.com.au` | `Promotions/Stores` | TRUE | TRUE | |
| TRUE | 203 | `from_domain` | `email.everyday.com.au` | `Promotions/Rewards` | TRUE | TRUE | Everyday Rewards。ストアではなくポイント案内 |

## Security — 現在 1 通しかない最大の穴

| 有効 | 優先度 | 種別 | パターン | ラベル | 受信トレイ除外 | 既読化 |
| --- | ---: | --- | --- | --- | --- | --- |
| TRUE | 300 | `query` | `subject:(認証コード OR 確認コード OR ワンタイム OR "verification code" OR "one-time" OR "security alert" OR "sign-in")` | `Security/Codes` | **FALSE** | **FALSE** |

`Security` は**受信トレイに残し、既読にもしない**。OTP は見えないと困る。
`Authentication/Login` が 1 通しかないのは、認証メールが全部受信トレイに
埋もれているからで、未読 9,225 通の一因でもある。

---


## Finance — 未分類だった銀行と決済

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 10 | `from_domain` | `ma.sonybank.jp` | `Finance/Accounts/Sony` | FALSE | FALSE | 未分類で受信トレイに素通り |
| TRUE | 11 | `from_domain` | `up.com.au` | `Finance/Accounts/Up` | FALSE | FALSE | 未分類。UP 銀行 (AU) |
| TRUE | 12 | `from_domain` | `paidy.com` | `Finance/Payments` | FALSE | FALSE | 未分類。後払い決済 |
| TRUE | 13 | `from_domain` | `jcb.co.jp` | `Finance/Cards/Jcb` | FALSE | FALSE | `CreditCards` の 100%。**2 サブドメインのうち片方は未分類だった** |
| TRUE | 14 | `from_domain` | `coincheck.com` | `Finance/Crypto/Coincheck` | FALSE | FALSE | `Accounts` の 8 割 |
| TRUE | 15 | `from_domain` | `netbk.co.jp` | `Finance/Accounts/Sbi` | FALSE | FALSE | 住信 SBI |
| TRUE | 16 | `from_domain` | `mail.caresuper.com.au` | `Finance/Superannuation` | FALSE | FALSE | 豪州年金。**帰国後に還付請求できる**のに未分類・未読だった |

## Orders — Amazon の 2 系統を割る

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 |
| --- | ---: | --- | --- | --- | --- | --- |
| TRUE | 20 | `from` | `shipment-tracking@amazon.co.jp` | `Orders/Amazon` | FALSE | FALSE |
| TRUE | 21 | `from` | `store-news@amazon.co.jp` | `Promotions/Stores` | TRUE | TRUE |
| TRUE | 22 | `from_domain` | `qoo10.jp` | `Orders/Qoo10` | FALSE | FALSE |

現行の `ファイナンス/Amazon` 816 通には発送通知と販促が混ざっている。
**優先度は発送通知を先に置く。** 販促のルールが先に当たると注文情報が受信トレイから消える。

## Subscriptions — 定期課金

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 30 | `from_domain` | `mail.anthropic.com` | `Subscriptions` | FALSE | FALSE | 請求書が未分類 |
| TRUE | 31 | `from_domain` | `stripe.com` | `Subscriptions` | FALSE | FALSE | 領収書が未分類・スター付き |
| TRUE | 32 | `from_domain` | `members.netflix.com` | `Subscriptions` | FALSE | FALSE | 現在 `Entertainments` |
| TRUE | 33 | `from_domain` | `send.vidiq.com` | `Subscriptions` | FALSE | FALSE | 未分類 |
| TRUE | 34 | `from_domain` | `anytimefitness.com.au` | `Subscriptions` | FALSE | FALSE | ジム会員 |
| TRUE | 35 | `from` | `googleaistudio-noreply@google.com` | `Subscriptions` | FALSE | FALSE | Google AI Studio |
| TRUE | 36 | `from` | `google-gemini-noreply@google.com` | `Subscriptions` | FALSE | FALSE | Gemini |

## Utilities — 通信

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 40 | `from_domain` | `spmode.ne.jp` | `Promotions` | TRUE | TRUE | ⚠️ **ドコモスポーツくじ**。通信の請求ではなく toto の販促。`Cashback rewards` の 44% |
| TRUE | 41 | `from_domain` | `kdlsupport.zendesk.com` | `Utilities/Mobile` | FALSE | FALSE | povo サポート |
| TRUE | 42 | `from_domain` | `emails.povo.jp` | `Utilities/Mobile` | FALSE | FALSE | povo |
| TRUE | 43 | `from_domain` | `mobile.rakuten.co.jp` | `Utilities/Mobile` | FALSE | FALSE | 楽天モバイル |
| TRUE | 44 | `from_domain` | `optus.com.au` | `Utilities/Mobile` | FALSE | FALSE | Optus (AU) |
| TRUE | 45 | `from_domain` | `digital.linkt.com.au` | `Utilities/Toll` | FALSE | FALSE | 豪州の有料道路 |

## Learning — 学習・資格

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 50 | `from_domain` | `iibc-global.org` | `Learning/Exams` | FALSE | FALSE | TOEIC 申込。**期限がある**のにスター付きで埋もれていた |
| TRUE | 51 | `from_domain` | `eigosapuri.jp` | `Learning/English` | FALSE | FALSE | 未分類・重要 |
| TRUE | 52 | `from` | `v-mail@dmm.com` | `Learning/English` | FALSE | FALSE | DMM 英会話。現在 `プロモーション/English` |
| TRUE | 53 | `from_domain` | `t.learn.coursera.org` | `Learning/Certificates` | FALSE | FALSE | **Google Career Certificate の修了証 8 通以上が未分類だった** |
| TRUE | 54 | `from_domain` | `m.learn.coursera.org` | `Learning/Courses` | FALSE | FALSE | 受講中のコース進捗 |
| TRUE | 55 | `from_domain` | `students.udemy.com` | `Learning/Courses` | FALSE | FALSE | Udemy |
| TRUE | 56 | `from_domain` | `duolingo.com` | `Learning/English` | TRUE | TRUE | 大量・全て未読の学習リマインダー |
| TRUE | 57 | `from_domain` | `elsanow.io` | `Learning/English` | FALSE | FALSE | ELSA |
| TRUE | 58 | `from_domain` | `studysapuri.jp` | `Learning/English` | FALSE | FALSE | スタディサプリ |
| TRUE | 59 | `from` | `noreply@eikaiwa.dmm.com` | `Learning/English` | FALSE | FALSE | DMM 英会話のレッスン予約確認 |
| TRUE | 60 | `from_domain` | `reserva.be` | `Learning/Admissions` | FALSE | FALSE | **入学相談会の予約がスター付きで未分類だった** |
| TRUE | 61 | `from_domain` | `willfu.jp` | `Learning/Admissions` | FALSE | FALSE | WILLFU |
| TRUE | 62 | `from_domain` | `efjapan.com` | `Learning/English` | FALSE | FALSE | EF |
| TRUE | 63 | `from_domain` | `techbowl.co.jp` | `Learning/Courses` | TRUE | TRUE | TechTrain |

## Health — 医療

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 60 | `from_domain` | `will-agaclinic.com` | `Health/Clinics` | FALSE | FALSE | 未分類・`IMPORTANT` |
| TRUE | 61 | `from` | `noreply-dmmclinic@dmm.com` | `Health/Clinics` | FALSE | FALSE | 未分類 |

## Work/Creative — 制作活動

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 65 | `from_domain` | `cloud.blackmagicdesign.com` | `Work/Creative` | FALSE | FALSE | **スター付き**で未分類 |
| TRUE | 66 | `from_domain` | `tunecore.co.jp` | `Work/Creative` | FALSE | FALSE | 楽曲配信 |

## Support / Official

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 70 | `from_domain` | `insta360jp.zendesk.com` | `Support` | FALSE | FALSE | やり取り 5 通 |
| TRUE | 71 | `from_domain` | `higgsfield.ai` | `Support` | FALSE | FALSE | やり取り 5 通 |
| TRUE | 72 | `from_domain` | `ubercarshare.com` | `Support` | FALSE | FALSE | やり取り 4 通 |
| TRUE | 80 | `from_domain` | `ezytaxsolutionsjapan.com.au` | `Official/Tax` | FALSE | FALSE | 確定申告 |
| TRUE | 81 | `from_domain` | `post.xero.com` | `Official/Tax` | FALSE | FALSE | 会計ソフト。スター付きで未分類 |
| TRUE | 82 | `from_domain` | `city.fukuoka.lg.jp` | `Official` | FALSE | FALSE | 福岡市役所 |
| TRUE | 83 | `from_domain` | `tmr.qld.gov.au` | `Official` | FALSE | FALSE | QLD 交通局 |
| TRUE | 84 | `from_domain` | `ato.gov.au` | `Official/Tax` | FALSE | FALSE | **豪州税務署**。ワーホリの税金還付に直結 |
| TRUE | 85 | `from_domain` | `qld.containersforchange.com.au` | `Official` | FALSE | FALSE | 容器リサイクルの還付 |

## 求人の追加分

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 | 根拠 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| TRUE | 123 | `from_domain` | `indeed.com` | `Promotions/Jobs/Alerts` | TRUE | TRUE | 未分類 |
| TRUE | 124 | `from_domain` | `linkedin.com` | `Promotions/Jobs/Agencies` | TRUE | TRUE | 中身はスカウト。現在 `プロモーション/Employment` |
| TRUE | 125 | `from_domain` | `recruitdirectscout.jp` | `Promotions/Jobs/Agencies` | TRUE | TRUE | リクルートダイレクトスカウト。**リクルート 6 サービス目**。未分類 |

## 未分類だった販促の追加分

| 有効 | 優先度 | 種別 | パターン | ラベル |
| --- | ---: | --- | --- | --- |
| TRUE | 210 | `from_domain` | `specials.coles.com.au` | `Promotions/Stores` |
| TRUE | 211 | `from_domain` | `comms.officeworks.com.au` | `Promotions/Stores` |
| TRUE | 212 | `from_domain` | `reply.ebay.com.au` | `Promotions/Stores` |
| TRUE | 213 | `from_domain` | `e.flybuys.com.au` | `Promotions/Rewards` |
| TRUE | 214 | `from_domain` | `countryroad.com.au` | `Promotions/Fashion` |
| TRUE | 215 | `from_domain` | `em.trenery.com.au` | `Promotions/Fashion` |
| TRUE | 216 | `from_domain` | `kfc.com.au` | `Promotions/Food` |
| TRUE | 217 | `from_domain` | `my.mcdonalds.com.au` | `Promotions/Food` |
| TRUE | 218 | `from_domain` | `mail-jp.nespresso.com` | `Promotions/Food` |
| TRUE | 219 | `from_domain` | `sender.skyscanner.com` | `Promotions/Travel` |
| TRUE | 220 | `from_domain` | `e.supercheapauto.com.au` | `Promotions/Vehicles` |
| TRUE | 221 | `from_domain` | `r.repco.com.au` | `Promotions/Vehicles` |
| TRUE | 222 | `from_domain` | `email.priceline.com.au` | `Promotions/Beauty` |
| TRUE | 223 | `from_domain` | `point.recruit.co.jp` | `Promotions/Rewards` |
| TRUE | 224 | `from_domain` | `tsite.jp` | `Promotions/Rewards` |

いずれも `受信トレイ除外 = TRUE` / `既読化 = TRUE`。

## Security の追加分

| 有効 | 優先度 | 種別 | パターン | ラベル | 除外 | 既読 |
| --- | ---: | --- | --- | --- | --- | --- |
| TRUE | 301 | `from_domain` | `discord.com` | `Security/Codes` | FALSE | FALSE |

`Personal` は初期ルールを置かない。
「`List-Unsubscribe` を持たず `noreply` でない」判定を実装してから作る。

---

## `@AU` の遡及付与は `migration` シートで行う

ワーホリは終了済みなので `@AU` は新規メールに付けない。
`migration` シートで既存ラベル配下に遡及付与するだけにする。
貼るデータは `docs/label-migration.md` の「`migration` シートへ貼るデータ」を参照
(ルール側に持たせると行が倍に増えるうえ新着への適用と混ざるため、ここには置かない)。

どうしても新着にも `@AU` を付けたい送信元が出てきた場合は、
ラベル用と拠点用でルールを 2 行に分ける。`凍結日` はルール全体を止めるので、
1 行に両方持たせると新着へのラベル付与ごと止まってしまう。

| 種別 | パターン | ラベル | 拠点 | 凍結日 | 効果 |
| --- | --- | --- | --- | --- | --- |
| `from_domain` | `example.com.au` | `Promotions/Stores` | (空) | (空) | 新着にラベルを付ける |
| `from_domain` | `example.com.au` | (空) | `@AU` | 移行日 | 過去メールにだけ拠点を付ける |

---

## 投入の順番

1. `importCurrentState()` で既存ラベルとフィルタを取り込む (全て `有効 = FALSE`)
2. この表を `rules` シートへ追記する
3. **`setup()` をもう一度実行する**。貼り付けはセルの入力規則ごと上書きするため、
   貼った範囲の `有効` / `受信トレイ除外` / `既読化` などがチェックボックスでなくなる。
   `setup()` が貼り直す (`TRUE` はチェックボックス表示でなくてもブール値なので
   振り分け自体は動くが、目視で確認できなくなる)
4. `DRY_RUN = TRUE` のまま「新着に適用する」を実行し、`log` を確認する
5. 問題なければ `config` の `DRY_RUN` を `FALSE` にして本適用
6. `docs/label-migration.md` の「`migration` シートへ貼るデータ」に沿って移行を実行
7. 取り込んだ旧フィルタ行を、ログで一致を確認できたものから有効化 / 削除する
