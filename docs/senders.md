# 送信元カタログ

Gmail API で全ラベルと未分類の受信トレイを走査した結果。
**メーリングリストと項目の対応表**であり、`senders` シートの初期投入元。

---

## 傾向

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
| `プロモーション/Affiliate` | `mail.dmm.com` | 100% |
| `ファイナンス/楽天カード` | `mail.rakuten-card.co.jp` | 100% |
| `ファイナンス/CreditCards` | `qa.jcb.co.jp` | 100% |
| `ファイナンス/Amazon` | `amazon.co.jp` (4 系統) | 100% |
| `Australia/Employment` | `seek.com.au` | 100% |
| `Australia/Beauty` | `smileie.au` / `smilepath.com.au` | 100% |
| `Schedules/DMM` | `eikaiwa.dmm.com` | 100% |
| `プロモーション/Employment` | `kuraveil.jp` | 86% |
| `ファイナンス/Accounts` | `coincheck.com` | 80% |

### 2. ラベル名と実体の乖離が頻発している

**名前から中身が推測できないラベルが 6 つあった。** これが「どこに入れるんだっけ」の正体。

| ラベル | 名前からの想像 | 実体 |
| --- | --- | --- |
| `プロモーション/Vehicles` | 車 | **JAL マイレージ + DiDi 配車**。車は 1 台も無い |
| `ファイナンス/Accounts` | 銀行口座 | **Coincheck (暗号資産) が 8 割** |
| `ファイナンス/CreditCards` | クレジットカード全般 | **JCB 1 社だけ** |
| `プロモーション/Entertainments` | 娯楽全般 | **Netflix だけ** |
| `Schedules/DMM` | DMM の予定 | **DMM 英会話のレッスン予約確認** |
| `Australia/Beauty` | 美容 | **マウスピース歯科矯正の広告** |

### 3. 同じ会社が別ドメイン・別サブドメインを使う

`from_domain` 単位のルールだけでは同じ会社を追い切れない。
**`senders` シートに `運営元` の列を持つ最大の理由。**

| 運営元 | ドメイン数 |
| --- | ---: |
| 楽天 | 11 |
| Amazon | 3 (地域 2 × 系統 6) |
| SHEIN | 5 |
| Coursera | 4 |
| Agoda | 4 |
| AliExpress | 4 |
| DMM | 4 |
| Uber | 4 |
| Google | 5 |
| JCB / DiDi / Booking.com / Duolingo / ELSA / Calendly / NordVPN | 各 2 |

JCB は 2 つのサブドメインのうち**片方だけラベルが付いていた**。
`qa.jcb.co.jp` は `CreditCards` の 100%、`cj.jcb.co.jp` は未分類。

### 4. 1 社の中で系統が割れる

**Agoda と Coursera は 1 社で 4 系統**に割れ、行き先が全部違う。

| 運営元 | 取引・通知 | 販促 | 問い合わせ | セキュリティ |
| --- | --- | --- | --- | --- |
| Agoda | `no-reply@agoda.com` | `sg.sgt.agoda-email.com` | `customerservice@` | `security.agoda.com` |
| Coursera | `t.learn.` (修了証) / `m.learn.` (進捗) | `m.send.` | — | — |
| Amazon | `auto-confirm@` `order-update@` `shipment-tracking@` `digital-no-reply@` | `store-news@` `vfe-campaign-response@` | — | — |
| DMM | `eikaiwa.dmm.com` `noreply-dmmclinic@` | `v-mail@` `dmm-affiliate@` | — | — |
| Uber | `uber@uber.com` | — | `ubercarshare.com` (3 ドメイン) | — |
| Hungry Jack's | `orders@` `accounts@` | `no-reply@` | — | — |
| Audiostock | `system@` (売上) | `staff@` | — | — |
| T2 Tea | `online@` | `teasocietynews@` | — | — |
| TAION | `inquiry@` | `member@mail.` | — | — |

`@` の前の名前が系統を表す傾向がある。判定の補助に使えるが**規則ではない**。

### 5. 同じサービスでも拠点・支店ごとにアドレスが違う

| サービス | アドレス |
| --- | --- |
| トランスコスモスパートナーズ | `fukuoka@` / `tokyo@` `ml.tcpartners.co.jp` |
| Anytime Fitness | `sunnybankhills@` / `armidale@` `anytimefitness.com.au` |
| CareSuper | `events@` / `caresuper@` `mail.caresuper.com.au` |
| 楽天市場の出店ショップ | `f222160-fukuroi_3@` / `f192139-koshu_6@` / `icockaden_2@` `shop.rakuten.co.jp` |

`from` の完全一致では取りこぼす。**ドメインが 1 社専用なら `from_domain`。**

### 6. 定期配信は時刻が一定

| 送信元 | 配信時刻 (UTC) |
| --- | --- |
| `kuraveil.jp` | 03:00 / 13:00 / 22:00 の 1 日 3 回 |
| `tokyochuobiyougeka.com` | 23:49〜23:51 |
| `e.rugby.com.au` | 毎日 02:00 前後 |
| `smilepath.com.au` | 22:00〜22:01 |
| `itreview.jp` | 00:03 / 00:33 |
| `duolingo.com` | 20:50 / 00:10 |

### 7. 取引メールほど読まれていない

| ラベル | 未読の状況 |
| --- | --- |
| `ファイナンス/Amazon` (816) | 標本 30 件が**全て未読** |
| `ファイナンス/楽天カード` (609) | 標本 25 件が**ほぼ全て未読** |
| `ファイナンス/CreditCards` (161) | 標本 25 件が**全て未読** |
| `プロモーション/English` (450) | 標本 20 件が**全て未読** |

三井住友カードの利用明細は**一部が TRASH に入っていた**。

### 8. catch-all ラベルが 2 つある

| ラベル | 通数 | 混入の実態 |
| --- | ---: | --- |
| `プロモーション/Cashback rewards` | 3,116 | 標本 50 のうち**ポイント還元は 3 件だけ**。44% が NTT ドコモ |
| `プロモーション/Fashion` | 3,977 | **約半分が美容外科** |

### 9. 時期によって送信元が総入れ替えになる

| 時期 | 中心 |
| --- | --- |
| 2022〜2023 (渡豪前) | **ほぼ楽天だけ** |
| 2024 年前半 (渡豪準備) | 予約・送金・語学 |
| 2024 年 8 月 (渡豪直後) | 住居・通信・銀行・勤怠 |
| 2025 年 | 買い物 (SHEIN / Amazon) |
| 2026 年前半 | 買い物と配送 |
| 2026 年 8 月 (帰国後) | 求人・銀行・医療・学習 |

---

## Finance

| 運営元 / サービス | 送信元 | 系統 | ラベル |
| --- | --- | --- | --- |
| 楽天カード | `info@mail.rakuten-card.co.jp` | transactional | `Finance/Cards/Rakuten` |
| JCB | `mail@qa.jcb.co.jp` | transactional | `Finance/Cards/Jcb` |
| JCB | `mail@cj.jcb.co.jp` | promotional | `Finance/Cards/Jcb` |
| 三井住友カード | `statement@vpass.ne.jp` | transactional | `Finance/Cards/Smcc` |
| 楽天証券 | `service@rakuten-sec.co.jp` | transactional | `Finance/Investments/Rakuten` |
| Coincheck | `support@coincheck.com` | transactional | `Finance/Crypto/Coincheck` |
| ソニー銀行 | `banking@ma.sonybank.jp` / `banking@sonybank.net` | transactional | `Finance/Accounts/Sony` |
| 住信 SBI ネット銀行 | `prom@netbk.co.jp` / `post_master@netbk.co.jp` | transactional | `Finance/Accounts/Sbi` |
| UP (AU) | `whats@up.com.au` | transactional | `Finance/Accounts/Up` |
| NAB (AU) | `nab@updates.nab.com.au` | transactional | `Finance/Accounts/Nab` |
| Paidy | `noreply@paidy.com` | transactional | `Finance/Payments` |
| Wise | `noreply@wise.com` | transactional | `Finance/Payments` |
| UnivaPay | `no-reply@univapay.com` | transactional | `Finance/Payments` |
| 楽天ペイ | `no-reply@pay.rakuten.co.jp` | transactional | `Finance/Payments` |
| 楽天チェックアウト | `info@checkout.rakuten.co.jp` | transactional | `Finance/Payments` |
| リクルート決済 | `info@settle.point.recruit.co.jp` | transactional | `Finance/Payments` |
| CareSuper (豪州年金) | `events@` / `caresuper@` `mail.caresuper.com.au` | notification | `Finance/Superannuation` |
| Spirit Super (豪州年金) | `info@spiritsuper.com.au` | notification | `Finance/Superannuation` |

## Orders

| 運営元 / サービス | 送信元 | 系統 | ラベル |
| --- | --- | --- | --- |
| Amazon | `auto-confirm@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | `order-update@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | `shipment-tracking@amazon.co.jp` / `@amazon.com.au` | transactional | `Orders/Amazon` |
| Amazon | `digital-no-reply@amazon.co.jp` | transactional | `Orders/Amazon` |
| Amazon | `donotreply@amazon.com.au` | transactional | `Orders/Amazon` |
| 楽天市場 | `order@rakuten.co.jp` | transactional | `Orders/Rakuten` |
| 楽天市場 (出店ショップ) | `*@shop.rakuten.co.jp` | transactional | `Orders/Rakuten` |
| AliExpress | `transaction@notice.aliexpress.com` / `account@notice.aliexpress.com` | transactional | `Orders/AliExpress` |
| メルカリ | `no-reply@mercari.jp` / `no-reply@email.mercari.jp` | transactional | `Orders/Mercari` |
| Qoo10 | `qoo10cs@qoo10.jp` | transactional | `Orders/Qoo10` |
| クロネコヤマト | `mail@kuronekoyamato.co.jp` | transactional | `Orders/Shipping` |
| Uber | `uber.australia@uber.com` / `uber@uber.com` / `noreply@uber.com` | transactional | `Orders` |
| Trip.com | `jp_flt_noreply@trip.com` | transactional | `Orders` |
| Hungry Jack's | `orders@` / `accounts@` `e.hungryjacks.com.au` | transactional | `Orders` |
| T2 Tea | `online@t2tea.com` | transactional | `Orders` |
| TAION | `inquiry@taion-wear.jp` | transactional | `Orders` |

## Subscriptions

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Anthropic | `invoice+statements@mail.anthropic.com` | `Subscriptions/Dev` |
| Stripe | `receipts+acct_…@stripe.com` | `Subscriptions/Dev` |
| Google Cloud Platform | `CloudPlatform-noreply@google.com` | `Subscriptions/Dev` |
| Netlify | `noreply@netlify.com` | `Subscriptions/Dev` |
| ngrok | `team@m.ngrok.com` | `Subscriptions/Dev` |
| Calendly | `teamcalendly@` / `webinars@` `send.calendly.com` | `Subscriptions/Dev` |
| Font Awesome | `hello@m.fontawesome.com` | `Subscriptions/Dev` |
| pdfFiller | `sarah@pdffiller.com` | `Subscriptions/Dev` |
| Coursera (課金) | `noreply@coursera.org` | `Subscriptions/Dev` |
| Netflix | `info@members.netflix.com` | `Subscriptions/Media` |
| Spotify | `no-reply@spotify.com` | `Subscriptions/Media` |
| Amazon Music | `no-reply@amazonmusic.com` | `Subscriptions/Media` |
| vidIQ | `hello@send.vidiq.com` | `Subscriptions/Tools` |
| NordVPN | `no-reply@mail.nordvpn.com` / `support@nordvpn.com` | `Subscriptions/Tools` |
| Google AI Studio | `googleaistudio-noreply@google.com` | `Subscriptions/Tools` |
| Google Gemini | `google-gemini-noreply@google.com` | `Subscriptions/Tools` |
| Google Maps | `noreply-maps-timeline@google.com` | `Subscriptions/Tools` |
| Anytime Fitness | `sunnybankhills@` / `armidale@` `anytimefitness.com.au` | `Subscriptions/Fitness` |
| Snap Fitness | `maroochydore@snapfitness.com.au` | `Subscriptions/Fitness` |

## Utilities

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| NTT ドコモ | `message_r@mail2.apl01.spmode.ne.jp` | `Utilities/Mobile` |
| povo (KDDI) | `important@` / `infoc@` `emails.povo.jp` | `Utilities/Mobile` |
| povo サポート | `povosupport@kdlsupport.zendesk.com` | `Utilities/Mobile` |
| 楽天モバイル | `rm-mail@` / `rmobile-notification@` `mobile.rakuten.co.jp` | `Utilities/Mobile` |
| Optus (AU) | `noreply@` / `myaccount@` `optus.com.au` | `Utilities/Mobile` |

## Security

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Discord | `noreply@discord.com` | `Security/Codes` |
| Agoda | `no-reply@security.agoda.com` | `Security/Alerts` |

## Schedule

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Coubic | `noreply@coubic.com` | `Schedule/Bookings` |
| Goki | `support@goki.travel` | `Schedule/Bookings` |
| Booking.com | `noreply@booking.com` | `Schedule/Bookings` |
| Agoda | `no-reply@agoda.com` | `Schedule/Bookings` |
| City Backpackers HQ | `info@citybackpackershq.com` | `Schedule/Bookings` |
| Boatshed | `reservations@boatshed.net.au` | `Schedule/Bookings` |

## Work

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| AWX | `payroll@` / `rarnold@` / `nmaitre@` / `sburke@` / `ihowie@` / `Aram.Leary@` `awx.com.au` | `Work/AWX` |
| Tanda | `rosters@tanda.co` / `reports@tanda.co` | `Work/Roster` |
| MYOB | `AccountRight@apps.myob.com` | `Work/Payslips` |
| FlareHR | `noreply@flarehr.com` / `hello@flarehr.com` | `Work` |
| People Infrastructure | `noreply@peopleinfrastructure.com` | `Work` |
| yagish | `noreply@yagish.jp` / `noreply_yagi@yagish.jp` | `Work` |
| Workcon | `payroll@workcon.com.au` | `Work/Applications` |
| Key's HR | `recruitment@keyshr.com` | `Work/Applications` |
| Siteforce Recruitment | `admin@siteforcerecruitment.com.au` | `Work/Applications` |
| iComply HC | `shoko@icomplyhc.com.au` | `Work/Applications` |
| Fresh Meats | `hr@freshmeats.com.au` | `Work/Applications` |
| Global FW | `hr@globalfw.com.au` | `Work/Applications` |
| MAW | `jobs@maw.net.au` | `Work/Applications` |
| Sunripe | `lina@sunripe.com.au` | `Work/Applications` |
| TuneCore | `noreply@tunecore.co.jp` | `Work/Creative` |
| Audiostock (売上) | `system@audiostock.jp` | `Work/Creative` |
| YouTube | `no-reply@youtube.com` | `Work/Creative` |
| Linktree | `hello@ma.linktr.ee` | `Work/Creative` |
| Blackmagic Design | `no-reply@cloud.blackmagicdesign.com` | `Work/Creative` |

## Learning

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Coursera (修了証) | `no-reply@t.learn.coursera.org` | `Learning/Certificates` |
| Coursera (進捗) | `Coursera@m.learn.coursera.org` | `Learning/Courses` |
| Udemy | `hello@students.udemy.com` | `Learning/Courses` |
| TechTrain | `techtrain-news@techbowl.co.jp` | `Learning/Courses` |
| IIBC (TOEIC) | `net-apply@iibc-global.org` | `Learning/Exams` |
| Duolingo | `hello@duolingo.com` / `no-reply@duolingo.com` | `Learning/English` |
| ELSA | `elsa@promo.elsanow.io` / `elsa@welcome.elsanow.io` | `Learning/English` |
| スタディサプリ | `noreply@eigosapuri.jp` / `cs-mail@` / `noreply-mail@` `studysapuri.jp` | `Learning/English` |
| DMM 英会話 | `v-mail@dmm.com` / `noreply@eikaiwa.dmm.com` | `Learning/English` |
| EF | `fukuoka@efjapan.com` | `Learning/English` |
| RESERVA (入学相談会) | `noreply@reserva.be` | `Learning/Admissions` |
| WILLFU | `info@willfu.jp` | `Learning/Admissions` |

## Health

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| AGA クリニック | `fukuoka@` / `form-web@` `will-agaclinic.com` | `Health/Clinics` |
| DMM クリニック | `noreply-dmmclinic@dmm.com` | `Health/Clinics` |
| Kean Health | `customer@keanhealth.co.jp` | `Health` |

## Housing

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Flatmates | `no-reply@flatmates.com.au` | `Housing` |

## Support

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Insta360 | `support@insta360jp.zendesk.com` | `Support` |
| Higgsfield | `support@higgsfield.ai` | `Support` |
| Uber Carshare | `support@ubercarshare.com` / `info@hey.ubercarshare.com` / `members@mail.ubercarshare.com` | `Support` |
| Agoda | `customerservice@agoda.com` | `Support` |
| スタディサプリ | `cs-mail@studysapuri.jp` | `Support` |
| Insta360 JP | `support@insta360jp.zendesk.com` | `Support` |

## Official

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| Ezy Tax Solutions | `accountant@ezytaxsolutionsjapan.com.au` | `Official/Tax` |
| Xero | `messaging-service@post.xero.com` | `Official/Tax` |
| freee | `freee@personal.freee.co.jp` | `Official/Tax` |
| 福岡市 | `shimin.JWO@city.fukuoka.lg.jp` | `Official` |
| QLD 交通局 | `CSB.SEQN.…@tmr.qld.gov.au` | `Official` |
| Sunshine Coast 市議会 | `mail@our.sunshinecoast.qld.gov.au` / `mail@sunshinecoast.qld.gov.au` | `Official` |

## Promotions/Jobs

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| kuraveil | `info@kuraveil.jp` | `Promotions/Jobs/Alerts` |
| SEEK | `noreply@s.` / `jobmail@s.` / `noreply@email.` / `noreply@` `seek.com.au` | `Promotions/Jobs/Alerts` |
| Indeed | `no-reply@indeed.com` | `Promotions/Jobs/Alerts` |
| Kmart 求人 | `kmartaustr-jobnotification@noreply10.jobs2web.com` | `Promotions/Jobs/Alerts` |
| doda | `cs@dm-doda.jp` / `editor@lifework-doda.jp` | `Promotions/Jobs/Agencies` |
| リクルートエージェント | `noreply@r-agent.com` / `s-noda@r-agent.com` | `Promotions/Jobs/Agencies` |
| リクルートダイレクトスカウト | `info@recruitdirectscout.jp` | `Promotions/Jobs/Agencies` |
| LinkedIn | `messages-noreply@linkedin.com` | `Promotions/Jobs/Agencies` |
| トランスコスモスパートナーズ | `fukuoka@` / `tokyo@` `ml.tcpartners.co.jp` | `Promotions/Jobs/Temp` |

## Promotions

| 運営元 / サービス | 送信元 | ラベル |
| --- | --- | --- |
| じゃらん | `point-j@` / `otodoke-j@` / `member@` `jalan.net`、`info15-j@email.jalan.net` | `Promotions/Travel` |
| Skyscanner | `no-reply@sender.skyscanner.com` | `Promotions/Travel` |
| JAL | `jmbnews@jalmail.jal.com` | `Promotions/Travel` |
| AirAsia | `no-reply@promo.airasia.com` | `Promotions/Travel` |
| Booking.com (販促) | `email.campaign@sg.booking.com` | `Promotions/Travel` |
| Agoda (販促) | `no-reply@sg.sgt.agoda-email.com` | `Promotions/Travel` |
| DiDi | `didi@jp.didiglobal.com` / `didi@mkt-jp.didiglobal.com` | `Promotions/Transport` |
| Bolt | `thailand@rides-marketing.bolt.eu` | `Promotions/Transport` |
| Neuron | `noreply@neuron.sg` / `feedback@neuron.sg` | `Promotions/Transport` |
| チャリチャリ | `no-reply@mail.charichari.co.jp` | `Promotions/Transport` |
| Super Cheap Auto | `clubsca@e.supercheapauto.com.au` | `Promotions/Vehicles` |
| Repco | `members@r.repco.com.au` | `Promotions/Vehicles` |
| ぐるなび | `gnavi-member@` / `point-edm@` `gnavi.co.jp` | `Promotions/Food` |
| KFC AU | `kfcmail@kfc.com.au` | `Promotions/Food` |
| McDonald's AU | `do-not-reply@my.mcdonalds.com.au` / `do-not-reply@e.maccas.com.au` | `Promotions/Food` |
| Hungry Jack's | `no-reply@e.hungryjacks.com.au` | `Promotions/Food` |
| Nespresso | `nespresso@mail-jp.nespresso.com` | `Promotions/Food` |
| T2 Tea | `teasocietynews@t2tea.com` | `Promotions/Food` |
| セブン & アイ | `info@sevenmp.omni7.jp` | `Promotions/Stores` |
| Coles | `coles@specials.coles.com.au` | `Promotions/Stores` |
| Officeworks | `email@comms.officeworks.com.au` | `Promotions/Stores` |
| Kmart | `kmail@emails.kmart.com.au` | `Promotions/Stores` |
| Westfield | `westfield@emailnews.westfield.com.au` | `Promotions/Stores` |
| eBay | `ebay@reply.ebay.com.au` | `Promotions/Stores` |
| Gumtree | `no-reply@emails.gumtree.com.au` | `Promotions/Stores` |
| 4WD Supacentre | `info@edm.4wdsupacentre.com.au` | `Promotions/Stores` |
| rebel | `rebel_active@email.rebelsport.com.au` | `Promotions/Stores` |
| JB Hi-Fi | `perks@email.jbhifi.com.au` | `Promotions/Stores` |
| Amazon (販促) | `store-news@amazon.co.jp` / `@amazon.com.au`、`vfe-campaign-response@amazon.com.au` | `Promotions/Stores` |
| AliExpress (販促) | `best-message-notice.a26@newarrival.aliexpress.com` / `message@info.aliexpress.com` | `Promotions/Stores` |
| 楽天市場 (イベント) | `ichiba-support@mail.event.rakuten.co.jp` | `Promotions/Stores` |
| 楽天メルマガ | `no-reply@mail.magazine.rakuten.co.jp` | `Promotions/Stores` |
| BUYMA | `info@buyma.com` | `Promotions/Fashion` |
| TAION | `member@mail.taion-wear.jp` | `Promotions/Fashion` |
| SHEIN | `edm.mail.` / `emailmarket.` / `news.market.` / `news.` / `news.emailmarket.` `shein.com` | `Promotions/Fashion` |
| Country Road | `no-reply@send.countryroad.com.au` / `email@em.countryroad.com.au` | `Promotions/Fashion` |
| Trenery | `news@em.trenery.com.au` | `Promotions/Fashion` |
| Cotton On | `news@e.cottonon.com` | `Promotions/Fashion` |
| Strandbags | `news@email.strandbags.com.au` | `Promotions/Fashion` |
| Lululemon | `hello-auz@e.lululemon.com` | `Promotions/Fashion` |
| City Beach | `marketing@hello.citybeach.com.au` | `Promotions/Fashion` |
| 東京中央美容外科 | `info@tokyochuobiyougeka.com` | `Promotions/Beauty` |
| ホットペッパービューティー | `mag@beauty.hotpepper.jp` | `Promotions/Beauty` |
| Smileie / SmilePath | `hello@smileie.au` / `team@smilepath.com.au` | `Promotions/Beauty` |
| Priceline | `Priceline@` / `Sisterclub@` `email.priceline.com.au` | `Promotions/Beauty` |
| Everyday Rewards (Woolworths) | `contacts@email.everyday.com.au` / `contacts@email.woolworthsrewards.com.au` | `Promotions/Rewards` |
| Flybuys | `Hello@e.flybuys.com.au` | `Promotions/Rewards` |
| リクルートポイント | `addp@point.recruit.co.jp` | `Promotions/Rewards` |
| 楽天ポイント | `info@point.rakuten.co.jp` / `point-notice-w@pointcard.rakuten.co.jp` | `Promotions/Rewards` |
| T ポイント (CCC) | `mytc@tsite.jp` | `Promotions/Rewards` |
| ITreview | `info@itreview.jp` | `Promotions/Tech` |
| Insta360 | `hey@insta360-news.com` | `Promotions/Creative` |
| Unsplash | `marketing@unsplash.com` | `Promotions/Creative` |
| Audiostock (販促) | `staff@audiostock.jp` | `Promotions/Creative` |
| Artlist | `team@newsletter.artlist.io` | `Promotions/Creative` |
| Color Grading Central | `denver@colorgradingcentral.com` | `Promotions/Creative` |
| note | `noreply@note.com` | `Promotions/Creative` |
| DMM アフィリエイト | `dmm-affiliate@mail.dmm.com` / `dmm-affiliate@dmm.inc` | `Promotions/Affiliate` |
| IronBull Strength | `store+63532597474@m.shopifyemail.com` / `support@ironbullstrength.com` | `Promotions/Fitness` |
| MyFitnessPal | `hello@e.blog.myfitnesspal.com` | `Promotions/Fitness` |
| Rugby AU | `reply@e.rugby.com.au` | `Promotions/Events` |
| Ticketek | `Ticketek@events.ticketek.com.au` | `Promotions/Events` |
| Coursera (新コース) | `no-reply@m.send.coursera.org` | `Promotions/Learning` |
| ELSA (販促) | `elsa@promo.elsanow.io` | `Promotions/Learning` |
| Tinder | `tinder@mail.tinder.com` | `Promotions` |

---

## 標本の限界

各ラベル 20〜50 スレッド、未分類は 9 巡・約 550 スレッド。
過去側 (2022〜2024 年 1 月) は全件走査済み。直近側は総量が大きく全件は見ていない。

本適用の前に必ずドライランを通し、`log` シートで実際の付与先を確認すること。
