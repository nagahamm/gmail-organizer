# 送信元カタログ

Gmail API で全ラベルを標本調査した結果。**メーリングリストと項目の対応表**。
標本は各ラベル 20〜50 スレッド。比率は標本内のもの。

---

## 全体の傾向

### 1. 1 ラベル ≒ 1 ドメイン

大半のラベルは単一の送信元が 80〜100% を占める。
**ルールは少数で足りる。** 現行フィルタが肥大化していたのは束ね方の問題であって、
送信元が多様だったからではない。

| ラベル | 最頻出の送信元 | 占有率 |
| --- | --- | ---: |
| `プロモーション/Travel` | `jalan.net` | ほぼ 100% |
| `プロモーション/Meal` | `gnavi.co.jp` | 100% |
| `プロモーション/Stores` | `sevenmp.omni7.jp` | 100% |
| `プロモーション/Entertainments` | `members.netflix.com` | 100% |
| `プロモーション/Affiliate` | `dmm-affiliate@mail.dmm.com` | 100% |
| `ファイナンス/楽天カード` | `mail.rakuten-card.co.jp` | 100% |
| `ファイナンス/Amazon` | `amazon.co.jp` (4 系統) | 100% |
| `Australia/Employment` | `seek.com.au` | 100% |
| `Australia/Beauty` | `smileie.au` / `smilepath.com.au` | 100% |
| `Schedules/DMM` | `eikaiwa.dmm.com` | 100% |
| `プロモーション/Employment` | `kuraveil.jp` | 86% |
| `ファイナンス/Accounts` | `coincheck.com` | 80% |

### 2. ラベル名と実体の乖離が頻発している

**名前から中身が推測できないラベルが 5 つあった。** これが「どこに入れるんだっけ」の正体。

| ラベル | 名前からの想像 | 実体 |
| --- | --- | --- |
| `プロモーション/Vehicles` | 車 | **JAL マイレージ + DiDi 配車**。車は 1 台も無い |
| `ファイナンス/Accounts` | 銀行口座 | **Coincheck (暗号資産) が 8 割** |
| `プロモーション/Entertainments` | 娯楽全般 | **Netflix だけ** |
| `Schedules/DMM` | DMM の予定 | **DMM 英会話のレッスン予約確認** |
| `Australia/Beauty` | 美容 | **マウスピース歯科矯正の広告** |

### 3. 定期配信は時刻が一定

メルマガは配信時刻がほぼ固定されている。判定の補助に使える。

| 送信元 | 配信時刻 (UTC) |
| --- | --- |
| `kuraveil.jp` | 03:00 / 13:00 / 22:00 の 1 日 3 回 |
| `tokyochuobiyougeka.com` | 23:49〜23:51 |
| `e.rugby.com.au` | 毎日 02:00 前後 |
| `smilepath.com.au` | 22:00〜22:01 |
| `itreview.jp` | 00:03 / 00:33 |

### 4. 取引メールほど読まれていない

**読むべきものが読まれていない**という逆転が起きている。

| ラベル | 未読の状況 |
| --- | --- |
| `ファイナンス/Amazon` (816) | 標本 30 件が**全て未読**。注文確認・発送通知・デジタル購入 |
| `ファイナンス/楽天カード` (609) | 標本 25 件が**ほぼ全て未読**。利用明細 |
| `プロモーション/English` (450) | 標本 20 件が**全て未読** |

販促を受信トレイから外していないので、取引メールが埋もれている。

### 5. catch-all ラベルが 2 つある

| ラベル | 通数 | 混入の実態 |
| --- | ---: | --- |
| `プロモーション/Cashback rewards` | 3,116 | 標本 50 のうち**ポイント還元は 3 件だけ**。44% が NTT ドコモ |
| `プロモーション/Fashion` | 3,977 | **約半分が美容外科** |

### 6. 拠点で送信元が総入れ替えになる

2026 年 2 月 (AU 滞在期) と 8 月 (日本) で未分類の顔ぶれが完全に違う。
AU 期は Amazon AU・AliExpress・小売の買い物が中心、
日本期は求人・銀行・医療が中心。

---

## 送信元 → ラベル 対応表

### Finance

| 送信元 | 実体 | ラベル | 現状 |
| --- | --- | --- | --- |
| `mail.rakuten-card.co.jp` | 楽天カード利用明細 | `Finance/Cards/Rakuten` | ✅ ほぼ全て未読 |
| `cj.jcb.co.jp` | JCB カード | `Finance/Cards/Jcb` | ⚠️ 未分類 |
| `coincheck.com` | Coincheck (暗号資産) | `Finance/Crypto/Coincheck` | ⚠️ `Accounts` の 8 割 |
| `netbk.co.jp` | 住信 SBI ネット銀行 | `Finance/Accounts/Sbi` | ⚠️ `Accounts` |
| `ma.sonybank.jp` | ソニー銀行 | `Finance/Accounts/Sony` | ⚠️ 未分類 |
| `up.com.au` | UP 銀行 (AU) | `Finance/Accounts/Up` | ⚠️ 未分類 |
| `paidy.com` | Paidy 後払い | `Finance/Payments` | ⚠️ 未分類 |
| (楽天証券) | 証券 | `Finance/Investments/Rakuten` | ✅ |

### Orders

| 送信元 | 実体 | ラベル | 現状 |
| --- | --- | --- | --- |
| `auto-confirm@amazon.co.jp` / `.com.au` | 注文確認 | `Orders/Amazon` | ⚠️ 全て未読 |
| `order-update@amazon.co.jp` / `.com.au` | 注文更新 | `Orders/Amazon` | ⚠️ 全て未読 |
| `shipment-tracking@amazon.co.jp` / `.com.au` | 発送通知 | `Orders/Amazon` | ⚠️ 全て未読 |
| `digital-no-reply@amazon.co.jp` | デジタル購入 | `Orders/Amazon` | ⚠️ 全て未読 |
| `transaction@notice.aliexpress.com` | AliExpress 取引 | `Orders/AliExpress` | ⚠️ 未分類 |
| `account@notice.aliexpress.com` | AliExpress アカウント | `Orders/AliExpress` | ⚠️ 未分類 |
| `qoo10.jp` | Qoo10 | `Orders/Qoo10` | ⚠️ 未分類 |
| `kuronekoyamato.co.jp` | クロネコヤマト | `Orders/Shipping` | ⚠️ 未分類 |
| `uber.australia@uber.com` | Uber 領収書 | `Orders` | ⚠️ 未分類 |

**`store-news@amazon.co.jp` / `.com.au` は販促なので `Promotions/Stores` へ。**
同じ Amazon でも系統で行き先が変わる。

### Subscriptions

| 送信元 | 実体 | 現状 |
| --- | --- | --- |
| `members.netflix.com` | Netflix | ⚠️ `Entertainments` (このラベルの 100%) |
| `mail.anthropic.com` | Anthropic 請求書 | ⚠️ 未分類・受信トレイ |
| `stripe.com` | Stripe 領収書 | ⚠️ 未分類・スター付き |
| `send.vidiq.com` | vidIQ (YouTube 分析) | ⚠️ 未分類 |
| `mail.nordvpn.com` | NordVPN | ⚠️ 未分類 |
| `amazonmusic.com` | Amazon Music | ⚠️ 未分類 |
| `m.fontawesome.com` | Font Awesome | ⚠️ `Developer` |
| `anytimefitness.com.au` | ジム会員 | ⚠️ 未分類 |
| `snapfitness.com.au` | ジム会員 | ⚠️ 未分類 |

### Utilities

| 送信元 | 実体 | 現状 |
| --- | --- | --- |
| `mail2.apl01.spmode.ne.jp` | NTT ドコモ | ⚠️ `Cashback rewards` の 44% |
| `emails.povo.jp` | povo | ⚠️ 未分類 |
| `kdlsupport.zendesk.com` | povo サポート | ⚠️ 未分類 |

### Promotions

| 送信元 | 実体 | ラベル |
| --- | --- | --- |
| `jalan.net` (`point-j` / `otodoke-j` / `member` / `info15-j`) | じゃらん | `Promotions/Travel` |
| `sender.skyscanner.com` | Skyscanner | `Promotions/Travel` |
| `jalmail.jal.com` | JAL マイレージ | `Promotions/Travel` ⚠️ 現 `Vehicles` |
| `promo.airasia.com` | AirAsia | `Promotions/Travel` ⚠️ 現 `Vehicles` |
| `jp.didiglobal.com` | DiDi 配車 | `Promotions/Transport` ⚠️ 現 `Vehicles` |
| `rides-marketing.bolt.eu` | Bolt 配車 | `Promotions/Transport` ⚠️ 現 `Vehicles` |
| `e.supercheapauto.com.au` | カー用品 AU | `Promotions/Vehicles` |
| `r.repco.com.au` | カー用品 AU | `Promotions/Vehicles` ⚠️ 現 `Cashback` |
| `gnavi.co.jp` | ぐるなび | `Promotions/Food` |
| `kfc.com.au` / `my.mcdonalds.com.au` / `e.hungryjacks.com.au` | ファストフード AU | `Promotions/Food` |
| `mail-jp.nespresso.com` / `t2tea.com` | 飲料 | `Promotions/Food` |
| `sevenmp.omni7.jp` | セブン & アイ | `Promotions/Stores` |
| `specials.coles.com.au` / `comms.officeworks.com.au` / `emails.kmart.com.au` | 小売 AU | `Promotions/Stores` |
| `reply.ebay.com.au` | eBay | `Promotions/Stores` |
| `store-news@amazon.co.jp` / `.com.au` | Amazon 販促 | `Promotions/Stores` |
| `newarrival.aliexpress.com` / `info.aliexpress.com` | AliExpress 販促 | `Promotions/Stores` |
| `edm.4wdsupacentre.com.au` | 4WD Supacentre | `Promotions/Stores` |
| `email.rebelsport.com.au` | rebel | `Promotions/Stores` |
| `email.jbhifi.com.au` | JB Hi-Fi | `Promotions/Stores` |
| `buyma.com` | BUYMA | `Promotions/Fashion` |
| `mail.taion-wear.jp` | TAION | `Promotions/Fashion` |
| `shein` (`edm.mail` / `emailmarket` / `news.market`) | SHEIN | `Promotions/Fashion` |
| `countryroad.com.au` / `em.trenery.com.au` / `e.cottonon.com` / `email.strandbags.com.au` | アパレル AU | `Promotions/Fashion` |
| `tokyochuobiyougeka.com` | 東京中央美容外科 | `Promotions/Beauty` ⚠️ 現 `Fashion` の約半分 |
| `beauty.hotpepper.jp` | ホットペッパービューティー | `Promotions/Beauty` ⚠️ 現 `Fashion` |
| `smileie.au` / `smilepath.com.au` | 歯科矯正 AU | `Promotions/Beauty` |
| `email.priceline.com.au` | ドラッグストア AU | `Promotions/Beauty` |
| `e.flybuys.com.au` | Flybuys ポイント | `Promotions/Rewards` |
| `point.recruit.co.jp` | リクルートポイント | `Promotions/Rewards` |
| `tsite.jp` | T ポイント | `Promotions/Rewards` |
| `email.everyday.com.au` | Everyday Rewards | `Promotions/Rewards` |
| `itreview.jp` | IT 製品レビュー | `Promotions/Tech` |
| `insta360-news.com` | Insta360 | `Promotions/Creative` |
| `marketing@unsplash.com` | Unsplash | `Promotions/Creative` |
| `audiostock.jp` | Audiostock | `Promotions/Creative` |
| `dmm-affiliate@mail.dmm.com` | DMM アフィリエイト | `Promotions/Affiliate` |
| `store+63532597474@m.shopifyemail.com` | IronBull (筋トレギア) | `Promotions/Fitness` |
| `ironbullstrength.com` | IronBull サポート | `Promotions/Fitness` |
| `e.rugby.com.au` | ラグビー AU | `Promotions/Events` |
| `events.ticketek.com.au` | Ticketek | `Promotions/Events` |
| `promo.elsanow.io` | ELSA 英語アプリ | `Promotions/Learning` |

### Promotions/Jobs

| 送信元 | 実体 | ラベル |
| --- | --- | --- |
| `kuraveil.jp` | ワーホリ斡旋の広告 | `Promotions/Jobs/Alerts` |
| `seek.com.au` (`noreply@s.` / `jobmail@s.` / `noreply@email.`) | SEEK | `Promotions/Jobs/Alerts` |
| `indeed.com` | Indeed | `Promotions/Jobs/Alerts` |
| `dm-doda.jp` / `lifework-doda.jp` | doda | `Promotions/Jobs/Agencies` |
| `r-agent.com` | リクルートエージェント | `Promotions/Jobs/Agencies` ⚠️ 現 `Cashback` |
| `linkedin.com` | LinkedIn スカウト | `Promotions/Jobs/Agencies` ⚠️ 現 `Employment` |
| `ml.tcpartners.co.jp` | トランスコスモス派遣 | `Promotions/Jobs/Temp` ⚠️ 未分類 |

### Work / Learning / Health / Support / Official

| 送信元 | 実体 | ラベル | 現状 |
| --- | --- | --- | --- |
| `awx.com.au` | 勤務先 AWX | `Work/AWX` | ✅ |
| `tunecore.co.jp` | TuneCore 楽曲配信 | `Work/Creative` | ⚠️ 未分類 |
| `yagish.jp` | 履歴書作成 | `Work` | ⚠️ 未分類 |
| `flarehr.com` | FlareHR (AU 福利厚生) | `Work` | ⚠️ 未分類 |
| `iibc-global.org` | TOEIC 申込 | `Learning/Exams` | ⚠️ 未分類・スター付き |
| `eigosapuri.jp` | スタディサプリ ENGLISH | `Learning/English` | ⚠️ 未分類 |
| `v-mail@dmm.com` | DMM 英会話メルマガ | `Learning/English` | ⚠️ `English`・全て未読 |
| `eikaiwa.dmm.com` | DMM 英会話レッスン予約 | `Learning/English` | ⚠️ `Schedules/DMM` |
| `will-agaclinic.com` | AGA クリニック | `Health/Clinics` | ⚠️ 未分類・重要 |
| `noreply-dmmclinic@dmm.com` | DMM クリニック | `Health/Clinics` | ⚠️ 未分類 |
| `insta360jp.zendesk.com` | Insta360 サポート | `Support` | ⚠️ 未分類 |
| `higgsfield.ai` | Higgsfield サポート | `Support` | ⚠️ 未分類 |
| `ubercarshare.com` | Uber Carshare サポート | `Support` | ⚠️ 未分類 |
| `ezytaxsolutionsjapan.com.au` | 税理士 | `Official/Tax` | ⚠️ 未分類 |
| `post.xero.com` | Xero 会計 | `Official/Tax` | ⚠️ 未分類・スター付き |
| `personal.freee.co.jp` | freee 会計 | `Official/Tax` | ⚠️ `Developer` |
| `city.fukuoka.lg.jp` | 福岡市役所 | `Official` | ⚠️ 未分類 |
| `tmr.qld.gov.au` | QLD 交通局 | `Official` | ⚠️ 未分類 |
| `discord.com` | Discord 認証 | `Security/Codes` | ⚠️ 未分類 |

---

## 標本の限界

各ラベル 20〜50 スレッド、未分類は 3 期間で 150 スレッド。
上位の送信元が極端に偏っているため方針を決めるには十分だが、
**裾野に少数の別種が混ざっている可能性は残る**。

本適用の前に必ずドライランを通し、`log` シートで実際の付与先を確認すること。
