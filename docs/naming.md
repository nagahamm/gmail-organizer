# ラベルの体系と命名規約

ラベルの軸は 2 本。**大項目 = メールの種別、中項目 = ジャンル、小項目 = ブランド**。
拠点は階層に混ぜず、並行ラベルとして付与する。

## 前提

- **ラベル名は英語**。大項目・中項目は英語、小項目のブランド名のみ原語 (`Rakuten` / `Amazon` / `AWX`)
- **拠点タグは `@AU` のみ**。新着にも付ける。
  ワーホリは終了したが、有料道路 (Linkt) / NAB / 年金 / Macca's / QLD と
  **豪州からのメールは今も届く**。年金の還付請求など帰国後も続く関係があるため、
  一度は凍結したが解除した
- **`@JP` は作らない**。`@AU` でないものは全部 JP なので、9,000 通以上に無意味なタグが付くだけ

## 大項目 (14)

| 大項目 | 意味 | 受信トレイ | 既読化 |
| --- | --- | --- | --- |
| `Finance` | 口座・カード・証券・決済・請求 | 残す | しない |
| `Orders` | EC 注文・発送・領収 | 残す | しない |
| `Subscriptions` | 定期課金しているサービス | 残す | しない |
| `Utilities` | 通信・電気・ガス・水道 | 残す | しない |
| `Promotions` | ニュースレター・広告 | **除外** | **する** |
| `Security` | OTP・ログイン通知・不正利用の警告 | 残す | しない |
| `Schedule` | 予約・イベント | 残す | しない |
| `Work` | 就職活動・勤務先 | 残す | しない |
| `Learning` | 学習・資格試験 | 残す | しない |
| `Health` | 医療 | 残す | しない |
| `Housing` | 住居・シェアハウス・賃貸 | 残す | しない |
| `Support` | 問い合わせ中の案件 | 残す | しない |
| `Official` | 行政・税務・ビザ | 残す | しない |
| `Personal` | 人から届いたメール | 残す | しない |

**除外してよいのは販促だけ**という線引きにする。
これを緩めると、Gmail フィルタで起きていた「静かに消える」が再発する。

ただし**既読化は除外と切り離す**。表は大項目の既定で、
決済の都度通知のように「記録は残したいが毎回開く必要はない」ものは、
受信トレイに残したまま既読にする (`docs/requirements.md`「機能: 既読化と受信トレイの保持」)。

## 境界の決め方

重なりやすい 3 つは次で切り分ける。

- **`Subscriptions`** — 定期課金しているサービス。「解約すべきか」を判断するためのラベル
- **`Utilities`** — 通信・光熱。生活インフラなので解約の判断対象にならない
- **`Finance/Bills`** — 上記以外の請求・支払い

`Promotions/Vehicles` と `Promotions/Travel` も混ざりやすい。

- **`Vehicles`** — 移動手段そのもの。ライドシェア (Bolt / DiDi)、シェアサイクル (チャリチャリ)
- **`Travel`** — 旅程を組むもの。**航空会社 (AirAsia / JAL) はこちら**。宿泊 (Agoda / じゃらん)

旧フィルタでは航空会社が `Vehicles` に入っていた。移動に関わるという一点で寄せると、
「旅行の予定を見返す」ときに航空券だけ別の場所にあることになる。

`Social` は作らない。LinkedIn の中身はスカウトなので `Promotions/Jobs/Agencies`、
Discord は認証コードなので `Security/Codes` に収まる。

## 中項目の切り方

### Subscriptions — 定期課金

通知が販促・未分類・スター付きに散らばっており、
**使っていないのに払っているものを見つけられない**状態だった。中身が厚いので中項目で割る。

| ラベル | 中身 | 送信元 |
| --- | --- | --- |
| `Subscriptions/Dev` | 開発・インフラ | Google Cloud Platform / ngrok / Netlify / Calendly / Anthropic / Stripe / Font Awesome / pdfFiller |
| `Subscriptions/Media` | 音楽・映像 | Spotify / Netflix / Amazon Music |
| `Subscriptions/Tools` | 制作・その他 | vidIQ / NordVPN / Google AI Studio / Gemini |
| `Subscriptions/Fitness` | ジム会員 | Anytime Fitness / Snap Fitness |

### Utilities — 通信・光熱

| ラベル | 中身 | 送信元 |
| --- | --- | --- |
| `Utilities/Mobile` | 携帯キャリア | povo / 楽天モバイル / Optus |
| `Utilities/Toll` | 有料道路 | Linkt (豪州) |

⚠️ `spmode.ne.jp` は当初 `Utilities/Mobile` へ入れる予定だったが、表示名が
「ドコモスポーツくじ」で通信ではなく toto の販促だと判明したため `Promotions` へ移した。

電気・ガス・水道と回線プロバイダは**送信元を観測できていないので作らない**。
出てきたときに足す。

### Learning — 学習・資格

`Promotions/Jobs` に次ぐ規模。送信元は 15 以上ある。

`Promotions/English` と送信元が重なるが、**系統が違う**ので分けたままにする。
`elsa@promo.elsanow.io` や `v-mail@dmm.com` のキャンペーンは `Promotions/English`、
学習の進捗通知が `Learning/English`。同じ会社が複数系統を出す例
(`docs/constraints.md` 5b/5d)。

| ラベル | 中身 | 送信元 |
| --- | --- | --- |
| `Learning/Certificates` | 修了証・資格認定 | Google Data Analytics Certificate。転職で提示できる実在の資格 |
| `Learning/Courses` | 受講中のコース進捗 | Coursera / Udemy / TechTrain |
| `Learning/Exams` | 資格試験の申込・受験票・結果 | TOEIC。申込には期限がある |
| `Learning/English` | 英語学習サービス | Duolingo / ELSA / DMM 英会話 / スタディサプリ / EF |
| `Learning/Admissions` | 進学・入学相談・オープンキャンパス | 入学相談会の予約確定 |

### Promotions/Books — 書籍

`store-news@amazon.co.jp` の「今日のKindle本お買い得情報」が毎日届く。
`Promotions/Stores` に混ぜると店舗の販促に埋もれるので分ける。
`Kindle` はブランド名なので、中項目はジャンルの `Books` にする。

### Health — 医療

| ラベル | 中身 | 送信元 |
| --- | --- | --- |
| `Health/Clinics` | 診察・予約・検査結果 | AGA クリニック / DMM クリニック |

旧フィルタでは美容外科が `Fashion` へ入っていた。診察の連絡が販促と同じ扱いなのは危うい。

### Official — 行政・税務

| ラベル | 送信元 |
| --- | --- |
| `Official/Tax` | 税理士 (`ezytaxsolutionsjapan.com.au`) / Xero (会計ソフト) |
| `Official` | 福岡市役所 / QLD 交通局 |

Containers for Change (ボトル返却の還付) は `Official` に**入れない**。
行政手続きではなく、ポイント還元と同じ「使うと戻ってくる」系なので
`Promotions/Rewards` に入る。

### Personal — 人から届いたメール

`List-Unsubscribe` を持たず `noreply` でない送信元で機械的に絞れる。

### Support — 問い合わせ中の案件

Insta360 / Higgsfield / povo / Uber Carshare のサポートスレッド。返信待ちが埋もれると困る。

## 大項目が増えた経緯

実態調査で、当初の体系に無かった 5 つが見つかった。
**観測できたから作った**のであって、先回りして枠を用意したのではない。

| 大項目 | 発見の経緯 |
| --- | --- |
| `Utilities` | `Cashback rewards` の 44% が NTT ドコモ (spmode) だった。通信キャリアがポイント還元に入っていた |
| `Subscriptions` | Anthropic の請求書と Stripe の領収書が未分類で受信トレイにあった。Netflix は販促扱いだった |
| `Learning` | TOEIC の申込がスター付きで受信トレイに埋もれていた。申込には期限がある |
| `Health` | AGA クリニックと DMM クリニックが未分類。どちらも `IMPORTANT` 付きの実際の診察連絡 |
| `Housing` | Flatmates (シェアハウス探し) が `IMPORTANT` 付きで未分類 |

## 単数か複数か

**数えられる名詞は複数形、数えられない名詞は単数形。**

英語の可算 / 不可算がそのまま基準になる。ラベルは「その中に何が入っているか」を
指すので、中身が数えられるなら複数形が自然になる。

| 区分 | 例 | 理由 |
| --- | --- | --- |
| 可算 → **複数形** | `Orders` / `Cards` / `Bills` / `Events` / `Jobs` / `Payslips` / `Accounts` / `Stores` / `Vehicles` / `Codes` / `Alerts` / `Subscriptions` / `Applications` / `Bookings` | 「注文が 3 件」と数えられる |
| 不可算 → **単数形** | `Finance` / `Fashion` / `Travel` / `Beauty` / `Fitness` / `Entertainment` / `Food` / `Furniture` / `Health` / `Security` / `Support` / `Work` / `Personal` / `Tech` | 「ファッションが 3 個」とは言わない |
| ブランド名 | `Amazon` / `Rakuten` / `AWX` / `DMM` | 原語のまま。複数化しない |

### 移行で直した例

実際に改名したもの。規約の当てはめ方の例として残す。

| 旧 | 新 | 理由 |
| --- | --- | --- |
| `Entertainments` | `Entertainment` | 不可算。`entertainments` は「催し物」の意味になり、ここでは違う |
| `Creater` | `Creator` | 綴り誤り |
| `Cashback rewards` | `Rewards` | 空白と小文字始まりを排除。`reward` は可算なので複数形 |
| `Meal` | `Food` | `meal` は「一食」を指す。ジャンル名としては不可算の `Food` |
| `Bill` | `Bills` | 可算 |
| `Payslip` | `Payslips` | 可算 |
| `Login` | `Alerts` | ログイン通知は可算。`Login` は動作であってラベル名に向かない |

`Furniture` は不可算なので旧名のままで正しい。`Accounts` / `Stores` /
`Vehicles` / `Events` も可算の複数形で正しい。

### 迷ったときの決め方

**そのラベルを開いたときに何が並ぶかで決める。**

- `Stores` を開くと「店」からのメールが並ぶ → 店は数えられる → 複数形
- `Fashion` を開くと「ファッションの情報」が並ぶ → 情報は数えられない → 単数形

ジャンルそのものを指す語 (`Tech` / `Creator` / `Affiliate` / `English`) は
分野名なので単数形にする。「Tech が 3 個」とは言わないのと同じ。

## その他の規約

- **略語を使わない**。`Auth` ではなく `Security`、`Dev` ではなく `Tech`。
  ラベル一覧で意味が一目で分かることを優先する
- **動詞を使わない**。`Login` ではなく `Alerts`、`Applied` ではなく `Applications`。
  ラベルは状態や物を指す名詞にする
- **大文字始まりのキャメルケース**。空白を入れない (`Cashback rewards` は不可)
- **拠点タグだけ `@` で始める** (`@AU`)。ラベル一覧の先頭に固まり、
  種別の木と視覚的に区別できる
