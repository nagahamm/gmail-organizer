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

## 運営元 → サービス → 送信元

`senders` シートへそのまま投入できる形。**1 社が複数のアドレスと複数のサービスを持つ**
ので、運営元とサービスを分けて持たないと整理できない。

系統: `transactional` = 取引 / `promotional` = 販促 / `notification` = 通知 / `support` = 問い合わせ

### 複数サービスを持つ運営元

同じ会社でも、サービスごとに行き先が変わる。ここが一番間違えやすい。

| 運営元 | サービス | 送信元 | 系統 | ラベル |
| --- | --- | --- | --- | --- |
| **Amazon** | 注文確認 | `auto-confirm@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | 注文更新 | `order-update@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | 発送通知 | `shipment-tracking@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | デジタル購入 | `digital-no-reply@amazon.co.jp` | transactional | `Orders/Amazon` |
| Amazon | ストアニュース | `store-news@amazon.co.jp` / `@amazon.com.au` | **promotional** | `Promotions/Stores` |
| Amazon | Amazon Music | `no-reply@amazonmusic.com` | promotional | `Subscriptions` |
| **リクルート** | リクルートエージェント | `noreply@r-agent.com` / `s-noda@r-agent.com` | promotional | `Promotions/Jobs/Agencies` |
| リクルート | リクルートポイント | `addp@point.recruit.co.jp` | promotional | `Promotions/Rewards` |
| リクルート | じゃらん | `point-j@jalan.net` / `otodoke-j@` / `member@` / `info15-j@email.jalan.net` | promotional | `Promotions/Travel` |
| リクルート | ホットペッパービューティー | `mag@beauty.hotpepper.jp` | promotional | `Promotions/Beauty` |
| **DMM** | DMM 英会話 (メルマガ) | `v-mail@dmm.com` | promotional | `Learning/English` |
| DMM | DMM 英会話 (予約確認) | `noreply@eikaiwa.dmm.com` | **transactional** | `Learning/English` |
| DMM | DMM アフィリエイト | `dmm-affiliate@mail.dmm.com` | promotional | `Promotions/Affiliate` |
| DMM | DMM クリニック | `noreply-dmmclinic@dmm.com` | **notification** | `Health/Clinics` |
| **楽天** | 楽天カード | `info@mail.rakuten-card.co.jp` | transactional | `Finance/Cards/Rakuten` |
| 楽天 | 楽天証券 | `service@rakuten-sec.co.jp` | transactional | `Finance/Investments/Rakuten` |
| 楽天 | 楽天ペイ | `no-reply@pay.rakuten.co.jp` | transactional | `Finance/Payments` |
| 楽天 | 楽天市場 | `order@checkout.rakuten.co.jp` | transactional | `Orders` |
| **パーソルキャリア** | doda スカウト | `cs@dm-doda.jp` | promotional | `Promotions/Jobs/Agencies` |
| パーソルキャリア | doda メルマガ | `editor@lifework-doda.jp` | promotional | `Promotions/Jobs/Agencies` |
| **SEEK** | 求人アラート | `noreply@s.seek.com.au` / `jobmail@s.seek.com.au` | promotional | `Promotions/Jobs/Alerts` |
| SEEK | お知らせ | `noreply@email.seek.com.au` / `noreply@seek.com.au` | notification | `Promotions/Jobs/Alerts` |
| **KDDI** | povo | `important@emails.povo.jp` / `infoc@emails.povo.jp` | notification | `Utilities/Mobile` |
| KDDI | povo サポート | `povosupport@kdlsupport.zendesk.com` | **support** | `Utilities/Mobile` |
| **Insta360** | 製品ニュース | `hey@insta360-news.com` | promotional | `Promotions/Creative` |
| Insta360 | サポート | `support@insta360jp.zendesk.com` | **support** | `Support` |
| **Uber** | Uber | `uber.australia@uber.com` | transactional | `Orders` |
| Uber | Uber Carshare | `support@ubercarshare.com` | **support** | `Support` |
| **AliExpress** | 取引通知 | `transaction@notice.aliexpress.com` / `account@notice.aliexpress.com` | transactional | `Orders/AliExpress` |
| AliExpress | 販促 | `best-message-notice.a26@newarrival.aliexpress.com` / `message@info.aliexpress.com` | promotional | `Promotions/Stores` |
| **SHEIN** | 販促 | `shein@edm.mail.shein.com` / `@emailmarket.shein.com` / `@news.market.shein.com` | promotional | `Promotions/Fashion` |
| **Coles Group** | Coles | `coles@specials.coles.com.au` | promotional | `Promotions/Stores` |
| Coles Group | Flybuys | `Hello@e.flybuys.com.au` | promotional | `Promotions/Rewards` |
| **Wesfarmers** | Kmart | `kmail@emails.kmart.com.au` | promotional | `Promotions/Stores` |
| Wesfarmers | Officeworks | `email@comms.officeworks.com.au` | promotional | `Promotions/Stores` |
| **Country Road Group** | Country Road | `no-reply@send.countryroad.com.au` / `email@em.countryroad.com.au` | promotional | `Promotions/Fashion` |
| Country Road Group | Trenery | `news@em.trenery.com.au` | promotional | `Promotions/Fashion` |

### 単一サービスの運営元

| 運営元 / サービス | 送信元 | 系統 | ラベル |
| --- | --- | --- | --- |
| Coincheck | `support@coincheck.com` | transactional | `Finance/Crypto/Coincheck` |
| 住信 SBI ネット銀行 | `prom@netbk.co.jp` | transactional | `Finance/Accounts/Sbi` |
| ソニー銀行 | `banking@ma.sonybank.jp` | transactional | `Finance/Accounts/Sony` |
| UP (AU) | `whats@up.com.au` | transactional | `Finance/Accounts/Up` |
| JCB | `mail@cj.jcb.co.jp` | transactional | `Finance/Cards/Jcb` |
| Paidy | `noreply@paidy.com` | transactional | `Finance/Payments` |
| Qoo10 | `qoo10cs@qoo10.jp` | transactional | `Orders/Qoo10` |
| クロネコヤマト | `mail@kuronekoyamato.co.jp` | transactional | `Orders/Shipping` |
| NTT ドコモ | `message_r@mail2.apl01.spmode.ne.jp` | notification | `Utilities/Mobile` |
| Anthropic | `invoice+statements@mail.anthropic.com` | transactional | `Subscriptions` |
| Stripe | `receipts+acct_…@stripe.com` | transactional | `Subscriptions` |
| Netflix | `info@members.netflix.com` | promotional | `Subscriptions` |
| vidIQ | `hello@send.vidiq.com` | promotional | `Subscriptions` |
| NordVPN | `no-reply@mail.nordvpn.com` | promotional | `Subscriptions` |
| Font Awesome | `hello@m.fontawesome.com` | promotional | `Subscriptions` |
| Anytime Fitness | `sunnybankhills@anytimefitness.com.au` | notification | `Subscriptions` |
| Snap Fitness | `maroochydore@snapfitness.com.au` | notification | `Subscriptions` |
| freee | `freee@personal.freee.co.jp` | notification | `Official/Tax` |
| Xero | `messaging-service@post.xero.com` | notification | `Official/Tax` |
| Ezy Tax Solutions | `accountant@ezytaxsolutionsjapan.com.au` | support | `Official/Tax` |
| 福岡市 | `shimin.JWO@city.fukuoka.lg.jp` | notification | `Official` |
| QLD 交通局 | `CSB.SEQN.…@tmr.qld.gov.au` | notification | `Official` |
| IIBC (TOEIC) | `net-apply@iibc-global.org` | transactional | `Learning/Exams` |
| スタディサプリ | `noreply@eigosapuri.jp` | notification | `Learning/English` |
| ELSA | `elsa@promo.elsanow.io` | promotional | `Promotions/Learning` |
| 東京中央美容外科 | `info@tokyochuobiyougeka.com` | promotional | `Promotions/Beauty` |
| Smileie / SmilePath | `hello@smileie.au` / `team@smilepath.com.au` | promotional | `Promotions/Beauty` |
| Priceline | `Priceline@email.priceline.com.au` | promotional | `Promotions/Beauty` |
| AGA クリニック | `fukuoka@will-agaclinic.com` / `form-web@will-agaclinic.com` | notification | `Health/Clinics` |
| kuraveil | `info@kuraveil.jp` | promotional | `Promotions/Jobs/Alerts` |
| Indeed | `no-reply@indeed.com` | promotional | `Promotions/Jobs/Alerts` |
| LinkedIn | `messages-noreply@linkedin.com` | promotional | `Promotions/Jobs/Agencies` |
| トランスコスモスパートナーズ | `fukuoka@ml.tcpartners.co.jp` | promotional | `Promotions/Jobs/Temp` |
| AWX | `payroll@awx.com.au` ほか個人アドレス | transactional | `Work/AWX` |
| TuneCore | `noreply@tunecore.co.jp` | notification | `Work/Creative` |
| yagish | `noreply_yagi@yagish.jp` | notification | `Work` |
| FlareHR | `noreply@flarehr.com` | notification | `Work` |
| Higgsfield | `support@higgsfield.ai` | support | `Support` |
| Discord | `noreply@discord.com` | notification | `Security/Codes` |
| セブン & アイ | `info@sevenmp.omni7.jp` | promotional | `Promotions/Stores` |
| CCC (T ポイント) | `mytc@tsite.jp` | promotional | `Promotions/Rewards` |
| Woolworths | `contacts@email.everyday.com.au` | promotional | `Promotions/Rewards` |
| eBay | `ebay@reply.ebay.com.au` | promotional | `Promotions/Stores` |
| 4WD Supacentre | `info@edm.4wdsupacentre.com.au` | promotional | `Promotions/Stores` |
| rebel | `rebel_active@email.rebelsport.com.au` | promotional | `Promotions/Stores` |
| JB Hi-Fi | `perks@email.jbhifi.com.au` | promotional | `Promotions/Stores` |
| BUYMA | `info@buyma.com` | promotional | `Promotions/Fashion` |
| TAION | `member@mail.taion-wear.jp` | promotional | `Promotions/Fashion` |
| Cotton On | `news@e.cottonon.com` | promotional | `Promotions/Fashion` |
| Strandbags | `news@email.strandbags.com.au` | promotional | `Promotions/Fashion` |
| ぐるなび | `gnavi-member@gnavi.co.jp` | promotional | `Promotions/Food` |
| KFC AU | `kfcmail@kfc.com.au` | promotional | `Promotions/Food` |
| McDonald's AU | `do-not-reply@my.mcdonalds.com.au` | promotional | `Promotions/Food` |
| Hungry Jack's | `no-reply@e.hungryjacks.com.au` | promotional | `Promotions/Food` |
| Nespresso | `nespresso@mail-jp.nespresso.com` | promotional | `Promotions/Food` |
| T2 Tea | `teasocietynews@t2tea.com` | promotional | `Promotions/Food` |
| Skyscanner | `no-reply@sender.skyscanner.com` | promotional | `Promotions/Travel` |
| JAL | `jmbnews@jalmail.jal.com` | promotional | `Promotions/Travel` |
| AirAsia | `no-reply@promo.airasia.com` | promotional | `Promotions/Travel` |
| DiDi | `didi@jp.didiglobal.com` | promotional | `Promotions/Transport` |
| Bolt | `thailand@rides-marketing.bolt.eu` | promotional | `Promotions/Transport` |
| Super Cheap Auto | `clubsca@e.supercheapauto.com.au` | promotional | `Promotions/Vehicles` |
| Repco | `members@r.repco.com.au` | promotional | `Promotions/Vehicles` |
| ITreview | `info@itreview.jp` | promotional | `Promotions/Tech` |
| Unsplash | `marketing@unsplash.com` | promotional | `Promotions/Creative` |
| Audiostock | `staff@audiostock.jp` | promotional | `Promotions/Creative` |
| IronBull Strength | `store+63532597474@m.shopifyemail.com` / `support@ironbullstrength.com` | promotional | `Promotions/Fitness` |
| Rugby AU | `reply@e.rugby.com.au` | promotional | `Promotions/Events` |
| Ticketek | `Ticketek@events.ticketek.com.au` | promotional | `Promotions/Events` |
| Everyday Rewards | `contacts@email.everyday.com.au` | promotional | `Promotions/Rewards` |

### 系統が同じ運営元の中で割れるもの

**同じ会社でも系統が違えば行き先が変わる。** ここを見落とすと事故になる。

| 運営元 | 取引 / 通知 | 販促 |
| --- | --- | --- |
| Amazon | `auto-confirm@` `order-update@` `shipment-tracking@` `digital-no-reply@` → `Orders` | `store-news@` → `Promotions` |
| AliExpress | `notice.aliexpress.com` → `Orders` | `newarrival.` / `info.` → `Promotions` |
| DMM | `eikaiwa.dmm.com` (予約確認) / `noreply-dmmclinic@` (診察) | `v-mail@` / `dmm-affiliate@` |
| Uber | `uber.com` (領収書) | — |
| KDDI | `kdlsupport.zendesk.com` (サポート) | `emails.povo.jp` (お知らせ) |

## 標本の限界

各ラベル 20〜50 スレッド、未分類は 3 期間で 150 スレッド。
上位の送信元が極端に偏っているため方針を決めるには十分だが、
**裾野に少数の別種が混ざっている可能性は残る**。

本適用の前に必ずドライランを通し、`log` シートで実際の付与先を確認すること。
