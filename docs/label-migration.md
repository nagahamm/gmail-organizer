# ラベル移行マッピング (レビュー用)

現行 39 ラベル → 新体系。件数は 2026-08-19 時点の `messagesTotal`。

## 前提

- **ラベル名は英語**。大項目・中項目は英語、小項目のブランド名のみ原語 (`Rakuten` / `Amazon` / `AWX`)
- **拠点タグは `@AU` のみ**。ワーホリは終了済みなので最初から凍結扱いにする
- **`@JP` は作らない**。`@AU` でないものは全部 JP なので、9,000 通以上に無意味なタグが付くだけ

## 大項目 (11)

命名は `docs/naming.md` に従う。可算名詞は複数形、不可算名詞は単数形。

| 大項目 | 意味 | 受信トレイ | 既読化 |
| --- | --- | --- | --- |
| `Finance` | 口座・カード・証券・請求・入出金 | 残す | しない |
| `Orders` | EC 注文・発送・領収 | 残す | しない |
| `Promotions` | ニュースレター・広告 | **除外** | **する** |
| `Security` | OTP・ログイン通知・不正利用の警告 | 残す | **しない** |
| `Schedule` | 予約・イベント | 残す | しない |
| `Work` | 就職活動・勤務先 | 残す | しない |
| `Support` | 問い合わせ中の案件 | 残す | **しない** |
| `Official` | 行政・税務・ビザ | 残す | **しない** |
| `Subscriptions` | 課金しているサービス | 残す | しない |
| `Health` | 医療 | 残す | しない |
| `Personal` | 人から届いたメール | 残す | **しない** |

`Money` ではなく `Finance` にした。`Money` は現金そのものを指す口語で、
口座・カード・証券・請求をまとめる語としては素朴すぎる。`Finance` は
不可算名詞なので単数形のままでよく、現行の `ファイナンス` の正規化にもなる。

`Auth` ではなく `Security` にしたのは、略語を避ける規約に従ったのと、
OTP だけでなく不正利用の警告やパスワード変更通知も同じ扱いで入るため。

`Job` ではなく `Work` にしたのは、雇用だけでなく制作の依頼や取引先との
やり取りも同じ扱いになるため。`Job` は「就職口」に限定されてしまう。

拠点ラベル: `@AU` (凍結済み)

---

## Finance

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `ファイナンス/Accounts` | 683 | `Finance/Accounts` | | 改名 |
| `ファイナンス/Deposit` | 7 | `Finance/Accounts/Deposits` | | 改名 |
| `ファイナンス/楽天カード` | 609 | `Finance/Cards/Rakuten` | | 改名 |
| `ファイナンス/CreditCards` | 161 | `Finance/Cards/Credit` | | 改名 |
| `ファイナンス/DebitCards` | 22 | `Finance/Cards/Debit` | | 改名 |
| `ファイナンス/楽天証券` | 60 | `Finance/Investments/Rakuten` | | 改名 |
| `ファイナンス/Revenue` | 10 | `Finance/Income` | | 改名 |
| `ファイナンス/Bill` | 6 | `Finance/Bills` | | 改名 |
| `Australia/Bill` | 26 | `Finance/Bills` | `@AU` | 統合 + 付与 |

## Orders

| 現行 | 件数 | 新 | 移行 |
| --- | ---: | --- | --- |
| `ファイナンス/Amazon` | 816 | `Orders/Amazon` | 改名 |

## Promotions (受信トレイ除外 + 既読)

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `プロモーション/Fashion` | 3,977 | `Promotions/Fashion` | | 改名 |
| `プロモーション/Cashback rewards` | 3,116 | `Promotions/Rewards` | | 改名 ⚠️ |
| `Australia/Stores` | 2,039 | `Promotions/Stores` | `@AU` | 統合 + 付与 |
| `プロモーション/Stores` | 480 | `Promotions/Stores` | | 改名 |
| `プロモーション/Travel` | 2,000 | `Promotions/Travel` | | 改名 |
| `プロモーション/Meal` | 1,497 | `Promotions/Food` | | 改名 |
| `Australia/Meal` | 0 | → `Promotions/Food` へ | | **削除** |
| `Australia/Beauty` | 1,029 | `Promotions/Beauty` | `@AU` | 改名 + 付与 |
| `プロモーション/Developer` | 777 | `Promotions/Tech` | | 改名 |
| `プロモーション/Vehicles` | 502 | `Promotions/Vehicles` | | 改名 |
| `プロモーション/English` | 450 | `Promotions/English` | | 改名 |
| `プロモーション/Affiliate` | 285 | `Promotions/Affiliate` | | 改名 |
| `プロモーション/Creater` | 269 | `Promotions/Creator` | | 改名 (綴り訂正) |
| `プロモーション/Entertainments` | 209 | `Promotions/Entertainment` | | 改名 (不可算) |
| `プロモーション/Furniture` | 148 | `Promotions/Furniture` | | 改名 |
| `プロモーション/Fitness` | 125 | `Promotions/Fitness` | | 改名 |

⚠️ `Rewards` にはリクルートエージェントの求人が誤って混入している。
移行後に中身を精査して `Promotions/Jobs/Agencies` へ移す。

## Promotions/Jobs — 読み流す求人

| 新ラベル | 中身 | 件数 (標本からの推定) |
| --- | --- | ---: |
| `Promotions/Jobs/Alerts` | 求人アラート (`kuraveil.jp` / `seek.com.au`) | 約 5,880 |
| `Promotions/Jobs/Agencies` | エージェント・スカウト (`doda` / `r-agent`) | 約 760 + α |
| `Promotions/Jobs/Temp` | 派遣・バイト (`tcpartners`) | 未計測 |

## Work — 自分が動いている側 (受信トレイに残す)

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `Australia/AWX` | 148 | `Work/AWX` | `@AU` | 改名 + 付与 |
| `Australia/AWX/Payslip` | 24 | `Work/AWX/Payslips` | `@AU` | 改名 + 付与 |
| — | 新規 | `Work/Applications` | | 提案経由で作成 |
| — | 新規 | `Work/Shortlist` | | スター起点で作成 |

`Applied` は動詞なので `Applications` にした。`Watching` も動詞なので、
求人サイトの用語として一般的な `Shortlist` にした。

## Security

| 現行 | 件数 | 新 | 移行 |
| --- | ---: | --- | --- |
| `Authentication/Login` | 1 | `Security/Alerts` | 改名 |
| — | 新規 | `Security/Codes` | 件名ルールで作成 |

`Codes` は OTP・確認コード。`Alerts` はログイン通知・不正利用の警告。
どちらも**受信トレイに残し、既読にもしない**。見えないと困る種類のため。

## Schedule

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `Australia/Events` | 455 | `Schedule/Events` | `@AU` | 改名 + 付与 |
| `Schedules/DMM` | 278 | `Schedule/DMM` | | 改名 |
| `Australia/Accommodations` | 0 | → `Schedule/Bookings` へ | | **削除** |
| — | 新規 | `Schedule/Bookings` | | 宿・レストラン・施設の予約確認 |

## 新設する大項目

いずれも**現在ラベルが無く受信トレイに埋もれている**ものを救出する。

| 新ラベル | 中身 | 根拠 |
| --- | --- | --- |
| `Support` | 問い合わせ中の案件 | 送信済みに Insta360 / Higgsfield / povo / Uber Carshare のサポートスレッドが 4 件以上。返信待ちのものが埋もれると困る |
| `Official` | 行政・税務・ビザ | 送信済みに福岡市役所・QLD 交通局・税理士。期限のあるものが多い |
| `Official/Tax` | 確定申告・税理士 | `ezytaxsolutionsjapan.com.au` と複数回やり取りしている |
| `Subscriptions` | 課金しているサービス | 現在 `Developer` に SaaS の宣伝と課金通知が混在。**使っていないのに払っている**ものを見つけるために独立させる |
| `Health` | 医療 | 現行フィルタで美容外科が `Fashion` へ入っている。診察・検査の連絡が販促と同じ扱いなのは危うい |
| `Personal` | 人から届いたメール | `List-Unsubscribe` を持たず `noreply` でない送信元で機械的に絞れる |

## 削除するプレースホルダ

`Australia` / `ファイナンス` / `プロモーション` / `Schedules` / `Authentication`
(いずれも 0 通)。**提案のみ。実削除は人間が Gmail 上で行う。**

## 要判断ポイントは解決済み

`docs/sampling-2026-08-19.md` の実測で 3 点とも確定した。

**① `Australia/Stores` に取引メールは混ざっていなかった**

標本 50 スレッドは全て販促 (4WD Supacentre / rebel / Everyday Rewards / JB Hi-Fi)。
注文確認・発送通知は 1 通も出なかった。`Promotions/Stores` + `@AU` で確定、`Orders` への分割は不要。
ただし `contacts@email.everyday.com.au` はポイント案内なので `Promotions/Rewards` に切り分ける。

**② 求人 6,641 通は 3 ドメインでほぼ説明がつく**

| 送信元 | 標本での比率 | 行き先 |
| --- | --- | --- |
| `kuraveil.jp` | `プロモーション/Employment` の 86% | `Promotions/Jobs/Alerts` (実態はワーホリ広告、購読解除の候補) |
| `seek.com.au` | `Australia/Employment` の 100% | `Promotions/Jobs/Alerts` + `@AU` |
| `dm-doda.jp` / `lifework-doda.jp` | 残り | `Promotions/Jobs/Agencies` |

**③ `Work/Applications` は「スレッドに自分の送信あり」で判定できる**

送信済み 61 スレッドを見たところ、応募は**メールで直接やり取り**しており、
プラットフォーム内で完結していない。この判定がそのまま使える。

さらに、これらのスレッドには**現在ユーザーラベルが付いておらず受信トレイに埋もれている**。
`Work/Applications` を作ると 15 前後のスレッドが救出される。

## サンプリングで見つかった追加の問題

**リクルートエージェントが `プロモーション/Cashback rewards` に入っている。**
`s-noda@r-agent.com` / `noreply@r-agent.com` の求人メールがポイント還元ラベルへ流れている。
`Cashback rewards` が 3,116 通と不自然に多いのは取りこぼしの受け皿になっているためと見られる。
移行時に中身を精査する。

**`fukuoka@ml.tcpartners.co.jp` が直近 2 日で 11 通、全て未読・ラベルなしで受信トレイにある。**
`Promotions/Jobs/Temp` の主要な構成要素になる。

初期ルールセットは `docs/initial-rules.md`。
