# ラベル移行マッピング (完了記録)

現行 39 ラベル → 新体系。件数は 2026-08-19 時点の `messagesTotal`。

**この移行は完了済み**。専用の `migration` シートと `src/migration.ts` は撤去した。
以降この文書は、39 ラベルを何へ移したかの記録として読む。`labels` シートの
`状態 = missing` の行や、Gmail の現在のラベル構成を読み解く手がかりになる。

## 前提

- **ラベル名は英語**。大項目・中項目は英語、小項目のブランド名のみ原語 (`Rakuten` / `Amazon` / `AWX`)
- **拠点タグは `@AU` のみ**。ワーホリは終了済みなので最初から凍結扱いにする
- **`@JP` は作らない**。`@AU` でないものは全部 JP なので、9,000 通以上に無意味なタグが付くだけ

## 大項目 (14)

命名は `docs/naming.md` に従う。可算名詞は複数形、不可算名詞は単数形。

| 大項目 | 意味 | 受信トレイ | 既読化 |
| --- | --- | --- | --- |
| `Finance` | 口座・カード・証券・決済・請求 | 残す | しない |
| `Orders` | EC 注文・発送・領収 | 残す | しない |
| `Subscriptions` | **定期課金しているサービス** | 残す | しない |
| `Utilities` | **通信・電気・ガス・水道** | 残す | しない |
| `Promotions` | ニュースレター・広告 | **除外** | **する** |
| `Security` | OTP・ログイン通知・不正利用の警告 | 残す | しない |
| `Schedule` | 予約・イベント | 残す | しない |
| `Work` | 就職活動・勤務先 | 残す | しない |
| `Learning` | **学習・資格試験** | 残す | しない |
| `Health` | **医療** | 残す | しない |
| `Housing` | **住居・シェアハウス・賃貸** | 残す | しない |
| `Support` | 問い合わせ中の案件 | 残す | しない |
| `Official` | 行政・税務・ビザ | 残す | しない |
| `Personal` | 人から届いたメール | 残す | しない |

`Promotions` 以外は全て受信トレイに残し、既読にもしない。
**除外して既読にしてよいのは販促だけ**という線引きにする。
これを緩めると、Gmail フィルタで起きていた「静かに消える」が再発する。

### 太字の 5 つが 2 巡目以降に見つかった抜け

| 大項目 | 発見の経緯 |
| --- | --- |
| `Utilities` | `Cashback rewards` の 44% が NTT ドコモ (spmode) だった。通信キャリアがポイント還元に入っていた |
| `Subscriptions` | Anthropic の請求書と Stripe の領収書が未分類で受信トレイにあった。Netflix は販促扱いだった |
| `Learning` | TOEIC の申込がスター付きで受信トレイに埋もれていた。申込には期限がある |
| `Health` | AGA クリニックと DMM クリニックが未分類。どちらも `IMPORTANT` 付きの実際の診察連絡 |
| `Housing` | Flatmates (シェアハウス探し) が `IMPORTANT` 付きで未分類。6 巡目で発見 |

### 境界の決め方

重なりやすい 3 つは次で切り分ける。

- **`Subscriptions`** — 定期課金しているサービス。「解約すべきか」を判断するためのラベル
- **`Utilities`** — 通信・光熱。生活インフラなので解約の判断対象にならない
- **`Finance/Bills`** — 上記以外の請求・支払い

`Social` は作らない。LinkedIn の中身はスカウトなので `Promotions/Jobs/Agencies`、
Discord は認証コードなので `Security/Codes` に収まる。

拠点ラベル: `@AU` (凍結済み)

---

## Finance

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `ファイナンス/Accounts` | 683 | `Finance/Accounts` | | 改名 |
| `ファイナンス/Deposit` | 7 | `Finance/Accounts/Deposits` | | 改名 |
| `ファイナンス/楽天カード` | 609 | `Finance/Cards/Rakuten` | | 改名 |
| `ファイナンス/CreditCards` | 161 | `Finance/Cards/Jcb` | | 改名 ⚠️ 中身は 100% JCB |
| `ファイナンス/DebitCards` | 22 | `Finance/Cards/Debit` | | 改名 |
| `ファイナンス/楽天証券` | 60 | `Finance/Investments/Rakuten` | | 改名 |
| `ファイナンス/Revenue` | 10 | `Finance/Income` | | 改名 |
| `ファイナンス/Bill` | 6 | `Finance/Bills` | | 改名 |
| `Australia/Bill` | 26 | `Finance/Bills` | `@AU` | 統合 + 付与 |
| — | 新規 | `Finance/Accounts/Sony` | | ソニー銀行。未分類だった |
| — | 新規 | `Finance/Accounts/Up` | `@AU` | UP 銀行。未分類だった |
| — | 新規 | `Finance/Payments` | | Paidy などの後払い決済 |
| — | 新規 | `Finance/Cards/Jcb` | | JCB。`CreditCards` の 100% |
| — | 新規 | `Finance/Crypto/Coincheck` | | Coincheck。`Accounts` の 8 割 |
| — | 新規 | `Finance/Superannuation` | `@AU` | 豪州の積立年金。**帰国後に還付請求できる**。CareSuper と Spirit Super の **2 社**ある |
| — | 新規 | `Finance/Accounts/Nab` | `@AU` | NAB (豪州銀行) |
| — | 新規 | `Finance/Cards/Smcc` | | 三井住友カード。一部が TRASH にあった |

## Orders

| 現行 | 件数 | 新 | 移行 |
| --- | ---: | --- | --- |
| `ファイナンス/Amazon` | 816 | `Orders/Amazon` | 改名 ⚠️ |
| — | 新規 | `Orders/Qoo10` | 未分類だった |

⚠️ 816 通には `shipment-tracking@amazon.co.jp` (発送通知) と
`store-news@amazon.co.jp` (販促) が混ざっている。販促分は `Promotions/Stores` へ分ける。
未読 580 通の多くが発送通知だった。

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
| `Promotions/Jobs/Alerts` | 求人アラート (`kuraveil.jp` / `seek.com.au` / `indeed.com`) | 約 5,880 |
| `Promotions/Jobs/Agencies` | エージェント・スカウト (`doda` / `r-agent` / `linkedin`) | 約 760 + α |
| `Promotions/Jobs/Temp` | 派遣・バイト (`tcpartners`) | 未計測 |

`indeed.com` は未分類、`r-agent.com` は `Cashback rewards`、
`linkedin.com` は `プロモーション/Employment` に散らばっていた。

## Work — 自分が動いている側 (受信トレイに残す)

| 現行 | 件数 | 新 | 拠点 | 移行 |
| --- | ---: | --- | --- | --- |
| `Australia/AWX` | 148 | `Work/AWX` | `@AU` | 改名 + 付与 |
| `Australia/AWX/Payslip` | 24 | `Work/AWX/Payslips` | `@AU` | 改名 + 付与 |
| — | 新規 | `Work/Applications` | | 提案経由で作成 |
| — | 新規 | `Work/Shortlist` | | スター起点で作成 |
| — | 新規 | `Work/Roster` | `@AU` | Tanda のシフト表。`IMPORTANT` 付きで未分類だった |
| — | 新規 | `Work/Payslips` | `@AU` | MYOB の給与明細。`IMPORTANT` 付きで未分類だった |
| — | 新規 | `Work/Creative` | | 楽曲販売・YouTube・Linktree。制作の**収益側** |

`Applied` は動詞なので `Applications` にした。`Watching` も動詞なので、
求人サイトの用語として一般的な `Shortlist` にした。

## Security

| 現行 | 件数 | 新 | 移行 |
| --- | ---: | --- | --- |
| `Authentication/Login` | 1 | `Security/Alerts` | 改名 |
| — | 新規 | `Security/Codes` | 件名ルールで作成 |

`Discord` の通知は認証コードなのでここに入る。

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

### Subscriptions — 定期課金

| 新ラベル | 中身 | 根拠 |
| --- | --- | --- |
| `Subscriptions/Dev` | 開発・インフラ | Google Cloud Platform / ngrok / Netlify / Calendly / Anthropic / Stripe / Font Awesome / pdfFiller |
| `Subscriptions/Media` | 音楽・映像 | Spotify / Netflix / Amazon Music |
| `Subscriptions/Tools` | 制作・その他 | vidIQ / NordVPN / Google AI Studio / Gemini |
| `Subscriptions/Fitness` | ジム会員 | Anytime Fitness / Snap Fitness |

7 巡目で中身が厚いことが分かったため中項目で割った。
通知が販促・未分類・スター付きに散らばっており、
**使っていないのに払っているものを見つけられない**状態だった。

### Utilities — 通信・光熱

| 新ラベル | 中身 | 根拠 |
| --- | --- | --- |
| `Utilities/Mobile` | 携帯キャリア | povo / 楽天モバイル / Optus の 3 社。⚠️ `spmode.ne.jp` は当初ここへ入れる予定だったが、表示名が「ドコモスポーツくじ」で通信ではなく toto の販促だと判明したため `Promotions` へ移した |
| `Utilities/Toll` | 有料道路 | Linkt (豪州) |
| `Utilities/Internet` | 回線・プロバイダ | 枠だけ用意 |
| `Utilities/Energy` | 電気・ガス・水道 | 枠だけ用意 |

### Learning — 学習・資格

9 巡目の狙い撃ち走査で、**`Promotions/Jobs` に次ぐ規模**だと分かった。送信元は 15 以上。

| 新ラベル | 中身 | 根拠 |
| --- | --- | --- |
| `Learning/Certificates` | 修了証・資格認定 | **Google Data Analytics Certificate の修了証 8 通以上が `IMPORTANT` 付きで未分類だった**。転職で提示できる実在の資格 |
| `Learning/Courses` | 受講中のコース進捗 | Coursera / Udemy / TechTrain |
| `Learning/Exams` | 資格試験の申込・受験票・結果 | TOEIC。調査時点の **4 日後に受験**があるのにスター頼みだった |
| `Learning/English` | 英語学習サービス | Duolingo / ELSA / DMM 英会話 / スタディサプリ / EF |
| `Learning/Admissions` | 進学・入学相談・オープンキャンパス | **入学相談会の予約確定がスター付きで未分類**。進学を検討している |

### Health — 医療

| 新ラベル | 中身 | 根拠 |
| --- | --- | --- |
| `Health/Clinics` | 診察・予約・検査結果 | AGA クリニック / DMM クリニックが未分類。どちらも `IMPORTANT` 付き |

現行フィルタでは美容外科が `Fashion` へ入っていた。診察の連絡が販促と同じ扱いなのは危うい。

### Support — 問い合わせ中の案件

送信済みに Insta360 / Higgsfield / povo / Uber Carshare のサポートスレッドが 4 件以上。
返信待ちが埋もれると困る。

### Official — 行政・税務

| 新ラベル | 根拠 |
| --- | --- |
| `Official/Tax` | 税理士 (`ezytaxsolutionsjapan.com.au`) と Xero (会計ソフト、スター付きで未分類) |
| `Official` | 福岡市役所 / QLD 交通局 |

### Personal — 人から届いたメール

`List-Unsubscribe` を持たず `noreply` でない送信元で機械的に絞れる。

## 削除するプレースホルダ

`Australia` / `ファイナンス` / `プロモーション` / `Schedules` / `Authentication` /
`Australia/Meal` / `Australia/Accommodations`
(いずれも 0 通)。**提案のみ。実削除は人間が Gmail 上で行う。**
`migration` シートには行を起こさない (対象スレッドが無いため)。

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

## `migration` シートへ貼るデータ

上の各表を `migration` シートの列順に書き起こした版。列を手で転記すると誤りやすいので、
この表をそのまま貼り付ける。`件数` は `seedMigrationPlan()` が `labels` シートから
上書きするので目安でよい。`拠点` が空の行は改名・統合のみで `@AU` は付けない。

`プロモーション/Employment` (5,418 通) はここに含まれない。単一ドメインに寄っていないため
1 行の改名・統合では割れず、`docs/initial-rules.md` の求人ルール (`kuraveil.jp` など) が
新着・既存の両方を個別に振り分ける。

| 有効 | 現行ラベル | 件数 | 新ラベル | 拠点 | 操作 | 備考 |
| --- | --- | ---: | --- | --- | --- | --- |
| TRUE | `ファイナンス/Accounts` | 683 | `Finance/Accounts` | | `rename` | |
| TRUE | `ファイナンス/Deposit` | 7 | `Finance/Accounts/Deposits` | | `rename` | |
| TRUE | `ファイナンス/楽天カード` | 609 | `Finance/Cards/Rakuten` | | `rename` | |
| TRUE | `ファイナンス/CreditCards` | 161 | `Finance/Cards/Jcb` | | `rename` | 中身は 100% JCB |
| TRUE | `ファイナンス/DebitCards` | 22 | `Finance/Cards/Debit` | | `rename` | |
| TRUE | `ファイナンス/楽天証券` | 60 | `Finance/Investments/Rakuten` | | `rename` | |
| TRUE | `ファイナンス/Revenue` | 10 | `Finance/Income` | | `rename` | |
| TRUE | `ファイナンス/Bill` | 6 | `Finance/Bills` | | `rename` | |
| TRUE | `Australia/Bill` | 26 | `Finance/Bills` | `@AU` | `merge` | |
| TRUE | `ファイナンス/Amazon` | 816 | `Orders/Amazon` | | `rename` | 発送通知と販促が混在。rules 優先度 20/21 が後追いで販促分を `Promotions/Stores` へ振り分ける |
| TRUE | `プロモーション/Fashion` | 3977 | `Promotions/Fashion` | | `rename` | |
| TRUE | `プロモーション/Cashback rewards` | 3116 | `Promotions/Rewards` | | `rename` | `r-agent.com` の求人が混入。rules 優先度 122 が後追いで `Promotions/Jobs/Agencies` へ移す |
| TRUE | `Australia/Stores` | 2039 | `Promotions/Stores` | `@AU` | `merge` | |
| TRUE | `プロモーション/Stores` | 480 | `Promotions/Stores` | | `rename` | |
| TRUE | `プロモーション/Travel` | 2000 | `Promotions/Travel` | | `rename` | |
| TRUE | `プロモーション/Meal` | 1497 | `Promotions/Food` | | `rename` | |
| TRUE | `Australia/Beauty` | 1029 | `Promotions/Beauty` | `@AU` | `rename` | |
| TRUE | `プロモーション/Developer` | 777 | `Promotions/Tech` | | `rename` | |
| TRUE | `プロモーション/Vehicles` | 502 | `Promotions/Vehicles` | | `rename` | |
| TRUE | `プロモーション/English` | 450 | `Promotions/English` | | `rename` | |
| TRUE | `プロモーション/Affiliate` | 285 | `Promotions/Affiliate` | | `rename` | |
| TRUE | `プロモーション/Creater` | 269 | `Promotions/Creator` | | `rename` | 綴り訂正 |
| TRUE | `プロモーション/Entertainments` | 209 | `Promotions/Entertainment` | | `rename` | 不可算名詞化 |
| TRUE | `プロモーション/Furniture` | 148 | `Promotions/Furniture` | | `rename` | |
| TRUE | `プロモーション/Fitness` | 125 | `Promotions/Fitness` | | `rename` | |
| TRUE | `Australia/Employment` | 1223 | `Promotions/Jobs/Alerts` | `@AU` | `merge` | 100% `seek.com.au` |
| TRUE | `Australia/AWX` | 148 | `Work/AWX` | `@AU` | `rename` | |
| TRUE | `Australia/AWX/Payslip` | 24 | `Work/AWX/Payslips` | `@AU` | `rename` | |
| TRUE | `Authentication/Login` | 1 | `Security/Alerts` | | `rename` | |
| TRUE | `Australia/Events` | 455 | `Schedule/Events` | `@AU` | `rename` | |
| TRUE | `Schedules/DMM` | 278 | `Schedule/DMM` | | `rename` | |

### 実行の記録

この表は `migration` シートへ貼って `runMigration()` で実行した。全行が `状態 = 完了`
となり、Gmail 側に旧ラベルは 1 つも残っていない。`@AU` は 4,938 通へ遡及付与した。
実行の明細は `log` シートに `rule_id = migration` として残っている。

移行が終わったため、`migration` シートと `src/migration.ts` は撤去した。
同じことをやり直す手段はもう無い。
