# 送信元カタログ

`rules` シートの内容と、`senders` シートまわりのデータ品質上の取り決めをまとめる。
**`rules` シートが真実の源であり、以下はその一覧化**。シートを直接見た方が確実なので、
大きな変更があった際に更新する。逐一の同期は保証しない。

---

## ルール一覧 (大項目別)

### Finance

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `ma.sonybank.jp` | `Finance/Accounts/Sony` |
| `from_domain` | `up.com.au` | `Finance/Accounts/Up` |
| `from_domain` | `paidy.com` | `Finance/Payments` |
| `from_domain` | `jcb.co.jp` | `Finance/Cards/Jcb` |
| `from_domain` | `coincheck.com` | `Finance/Crypto/Coincheck` |
| `from_domain` | `netbk.co.jp` | `Finance/Accounts/Smtb` |
| `from_domain` | `mail.caresuper.com.au` | `Finance/Superannuation` |
| `from` | `info@mail.rakuten-card.co.jp` | `Finance/Cards/Rakuten` |
| `from` | `no-reply@pay.rakuten.co.jp` | `Finance/Cards/Rakuten` |
| `from` | `order@checkout.rakuten.co.jp` | `Finance/Cards/Rakuten` |
| `from` | `service@rakuten-sec.co.jp` | `Finance/Investments/Rakuten` |
| `from` | `bank-news@mail.rakuten-bank.co.jp` | `Finance/Accounts` |
| `from` | `banking@ma.sonybank.net` | `Finance/Accounts` |
| `from` | `mailnews@mm.mizuhobank.co.jp` | `Finance/Accounts` |
| `from` | `rewards@mx.starbucks.co.jp` | `Finance/Bills` |
| `from` | `no-reply@mercari.jp` | `Finance/Income` |
| `from` | `card_admin@mx.starbucks.co.jp` | `Finance/Accounts/Deposits` |
| `from` | `rakutencash@rakuten.co.jp` | `Finance/Accounts/Deposits` |
| `from` | `no-reply@ridebeam.com` | `Finance/Bills` |

### Health

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `will-agaclinic.com` | `Health/Clinics` |
| `from` | `noreply-dmmclinic@dmm.com` | `Health/Clinics` |

### Learning

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `iibc-global.org` | `Learning/Exams` |
| `from_domain` | `eigosapuri.jp` | `Learning/English` |
| `from` | `v-mail@dmm.com` | `Learning/English` |
| `from_domain` | `t.learn.coursera.org` | `Learning/Certificates` |
| `from_domain` | `m.learn.coursera.org` | `Learning/Courses` |
| `from_domain` | `students.udemy.com` | `Learning/Courses` |
| `from_domain` | `duolingo.com` | `Learning/English` |
| `from_domain` | `elsanow.io` | `Learning/English` |
| `from_domain` | `studysapuri.jp` | `Learning/English` |
| `from` | `noreply@eikaiwa.dmm.com` | `Learning/English` |
| `from_domain` | `willfu.jp` | `Learning/Admissions` |
| `from_domain` | `efjapan.com` | `Learning/English` |
| `from_domain` | `techbowl.co.jp` | `Learning/Courses` |

### Official

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `ezytaxsolutionsjapan.com.au` | `Official/Tax` |
| `from_domain` | `post.xero.com` | `Official/Tax` |
| `from_domain` | `city.fukuoka.lg.jp` | `Official` |
| `from_domain` | `tmr.qld.gov.au` | `Official` |
| `from_domain` | `ato.gov.au` | `Official/Tax` |

### Orders

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from` | `shipment-tracking@amazon.co.jp` | `Orders/Amazon` |
| `from_domain` | `qoo10.jp` | `Orders/Qoo10` |

### Promotions

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from` | `store-news@amazon.co.jp` | `Promotions/Stores` |
| `from_domain` | `spmode.ne.jp` | `Promotions` |
| `from_domain` | `tunecore.co.jp` | `Promotions/Creator` |
| `from_domain` | `qld.containersforchange.com.au` | `Promotions/Rewards` |
| `from` | `info@oisix.com` | `Promotions/Food` |
| `from_domain` | `kuraveil.jp` | `Promotions/Jobs/Alerts` |
| `from_domain` | `gnavi.co.jp` | `Promotions/Food` |
| `from` | `@buyma.com` | `Promotions/Fashion` |
| `from` | `info@tokyochuobiyougeka.com` | `Promotions/Beauty` |
| `from` | `noreply@fabric-tokyo.com` | `Promotions/Fashion` |
| `from` | `shein@edm.jp.sheinemail.com` | `Promotions/Fashion` |
| `from` | `mag@beauty.hotpepper.jp` | `Promotions/Fashion` |
| `from` | `member@mail.taion-wear.jp` | `Promotions/Fashion` |
| `from_domain` | `agoda-emails.com` | `Promotions/Travel/Accommodations` |
| `from` | `jpmail@expediamail.com` | `Promotions/Travel/Accommodations` |
| `from` | `noreply@instabase.jp` | `Promotions/Travel` |
| `from_domain` | `seek.com.au` | `Promotions/Jobs/Alerts` |
| `from_domain` | `jalan.net` | `Promotions/Travel/Accommodations` |
| `from` | `trip.com@newsletter.trip.com` | `Promotions/Travel` |
| `from_domain` | `freee.co.jp` | `Promotions/Tech` |
| `from` | `hello@m.fontawesome.com` | `Promotions/Tech` |
| `from` | `info@itreview.jp` | `Promotions/Tech` |
| `from` | `no-reply@email.slackhq.com` | `Promotions/Tech` |
| `from` | `no-reply@ecom1.logitech.com` | `Promotions/Tech` |
| `from_domain` | `dm-doda.jp` | `Promotions/Jobs/Agencies` |
| `from_domain` | `lifework-doda.jp` | `Promotions/Jobs/Agencies` |
| `from_domain` | `r-agent.com` | `Promotions/Jobs/Agencies` |
| `from_domain` | `indeed.com` | `Promotions/Jobs/Alerts` |
| `from_domain` | `linkedin.com` | `Promotions/Jobs/Agencies` |
| `from_domain` | `recruitdirectscout.jp` | `Promotions/Jobs/Agencies` |
| `from_domain` | `ml.tcpartners.co.jp` | `Promotions/Jobs/Temp` |
| `from` | `@emagazine.rakuten.co.jp` | `Promotions/Rewards` |
| `from` | `contact@kanademono.design` | `Promotions/Furniture` |
| `from` | `noreply@email.bydesign.co.jp` | `Promotions/Furniture` |
| `from_domain` | `airasia.com` | `Promotions/Travel/Flights` |
| `from_domain` | `bolt.eu` | `Promotions/Vehicles` |
| `from` | `news@neuet.com` | `Promotions/Vehicles` |
| `from` | `didi@jp.didiglobal.com` | `Promotions/Vehicles` |
| `from` | `jmbnews@jalmail.jal.com` | `Promotions/Travel/Flights` |
| `from` | `no-reply@primevideo.com` | `Promotions/Entertainment` |
| `from` | `info@ms.starbucks.co.jp` | `Promotions/Stores` |
| `from` | `info@sevenmp.omni7.jp` | `Promotions/Stores` |
| `from` | `staff@audiostock.jp` | `Promotions/Creator` |
| `from` | `hey@insta360-news.com` | `Promotions/Creator` |
| `from` | `marketing@unsplash.com` | `Promotions/Creator` |
| `from` | `noreply@best.wondershare.com` | `Promotions/Creator` |
| `from` | `hello@email.myfitnesspal.com` | `Promotions/Fitness` |
| `from` | `support@ironbullstrength.com` | `Promotions/Fitness` |
| `from` | `ksd3.klaviyomail.com` | `Promotions/Fitness` |
| `from` | `store+63532597474@m.shopifyemail.com` | `Promotions/Fitness` |
| `from` | `dmm-affiliate@mail.dmm.com` | `Promotions/Affiliate` |
| `from` | `reply@e.rugby.com.au` | `Promotions/Events` |
| `from` | `au-news@t2teasociety.com` | `Promotions/Stores` |
| `from` | `flybuys@edm.flybuys.com.au` | `Promotions/Rewards` |
| `from` | `hello@smileie.au` | `Promotions/Beauty` |
| `from` | `team@smilepath.com.au` | `Promotions/Beauty` |
| `from_domain` | `edm.4wdsupacentre.com.au` | `Promotions/Stores` |
| `from_domain` | `email.rebelsport.com.au` | `Promotions/Stores` |
| `from_domain` | `email.jbhifi.com.au` | `Promotions/Stores` |
| `from_domain` | `email.everyday.com.au` | `Promotions/Rewards` |
| `from_domain` | `specials.coles.com.au` | `Promotions/Stores` |
| `from_domain` | `comms.officeworks.com.au` | `Promotions/Stores` |
| `from_domain` | `reply.ebay.com.au` | `Promotions/Stores` |
| `from_domain` | `e.flybuys.com.au` | `Promotions/Rewards` |
| `from_domain` | `countryroad.com.au` | `Promotions/Fashion` |
| `from_domain` | `em.trenery.com.au` | `Promotions/Fashion` |
| `from_domain` | `kfc.com.au` | `Promotions/Food` |
| `from_domain` | `my.mcdonalds.com.au` | `Promotions/Food` |
| `from_domain` | `mail-jp.nespresso.com` | `Promotions/Food` |
| `from_domain` | `sender.skyscanner.com` | `Promotions/Travel/Flights` |
| `from_domain` | `e.supercheapauto.com.au` | `Promotions/Vehicles` |
| `from_domain` | `r.repco.com.au` | `Promotions/Vehicles` |

### Schedule

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `reserva.be` | `Schedule/Bookings` |
| `from` | `info@email.meetup.com` | `Schedule/Events` |
| `from` | `ticketek@events.ticketek.com.au` | `Schedule/Events` |

### Security

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from` | `message@adobe.com` | `Security/Alerts` |
| `query` | `subject:(認証コード OR 確認コード OR ワンタイム OR "verification code" OR "one-time" OR "security alert" OR "sign-in")` | `Security/Codes` |

### Subscriptions

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `mail.anthropic.com` | `Subscriptions` |
| `from_domain` | `stripe.com` | `Subscriptions` |
| `from_domain` | `members.netflix.com` | `Subscriptions` |
| `from_domain` | `send.vidiq.com` | `Subscriptions` |
| `from_domain` | `anytimefitness.com.au` | `Subscriptions` |
| `from` | `googleaistudio-noreply@google.com` | `Subscriptions` |
| `from` | `google-gemini-noreply@google.com` | `Subscriptions` |

### Support

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `insta360jp.zendesk.com` | `Support` |
| `from_domain` | `higgsfield.ai` | `Support` |
| `from_domain` | `ubercarshare.com` | `Support` |

### Utilities

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `kdlsupport.zendesk.com` | `Utilities/Mobile` |
| `from_domain` | `emails.povo.jp` | `Utilities/Mobile` |
| `from_domain` | `mobile.rakuten.co.jp` | `Utilities/Mobile` |
| `from_domain` | `optus.com.au` | `Utilities/Mobile` |
| `from_domain` | `digital.linkt.com.au` | `Utilities/Toll` |

### Work

| 種別 | パターン | ラベル |
| --- | --- | --- |
| `from_domain` | `cloud.blackmagicdesign.com` | `Work/Creative` |
| `from` | `rarnold@awx.com.au` | `Work/AWX` |
| `from` | `payroll@awx.com.au` | `Work/AWX` |

---

## 表示名の正規化ルール

`src/gmailx.ts` の `normalizeDisplayName()` が担う。詳細はコードのコメントと
`test/behaviour.test.mjs` を参照。要点だけここに書く。

- 全角の欧字・括弧・スペースを半角に揃える (NFKC)
- 「株式会社」「(株)」は法人格の表記ゆれとして落とす
- 英数字の直後に**部署・窓口を表す語尾**(`運営事務局` `お問い合わせ窓口`
  `カスタマーサポート` `サポートセンター` `事務局` `窓口` `センター`)が続く場合だけ
  スペースを入れる (`povo2.0運営事務局` → `povo2.0 運営事務局`)
- それ以外の英数字+日本語の境界にはスペースを**入れない**。`SBI証券` `楽天証券`
  `松井証券` のように、証券・銀行などはブランド名そのものの一部であり、
  会社の種類を表す語尾にはスペースを入れると不自然になるため

## 運営元・サービスの命名規約

- **運営元 = 親会社、サービス = 具体的なブランド/サブサービス**
  (例: 楽天 / 楽天ビューティ、パーソルキャリア / doda)
- 運営元とサービスが実質同じ文字列になる場合、サービス欄は**空欄にする**
  (例: JCB / 空欄、Netflix / 空欄)。重複表記を避けるため
- 運営元列でも法人格の表記ゆれ(「株式会社」等)は落とす。
  `normalizeDisplayName()` は表示名列にしか使っていないので、運営元列は
  直値で直す必要がある (`dev-overwrite` を使う。下記)

## senders のデータ品質メンテナンス

一度きりの復旧処理として `src/senders.ts` に用意している。**メニューには登録しない**
(CLAUDE.md「守ること」)。Apps Script エディタの「関数を選択して実行」から呼ぶ。

| 関数 | 内容 |
| --- | --- |
| `dedupeSenders()` | 同じ送信元アドレスが複数行に分かれている場合、1 行に統合する。
  `refreshSenders()` が同時に2回走ると発生しうる (`LockService` で再発は防止済み) |
| `renormalizeSenderDisplayNames()` | 既存の表示名を今の `normalizeDisplayName()` の
  ルールで作り直す。ルール変更前に取り込んだ古い表示名を遡って直す |
| `cleanupSenderGarbage()` | 運営元・サービスに紛れ込んだ Gmail のクリック追跡URL
  (`https://www.google.com/url?q=...`) を検出して空にする。リンク化テキストの
  コピー→オートフィルで複製されることがある |

## 開発用データ投入 (dev-seed / dev-update / dev-overwrite)

`senders` の運営元・サービス・表示名を直値で直したい場合は、Claude が
中継メール経由で投入する。詳細は `docs/design.md` 5.7。

- `dev-update`: 空欄セルだけ埋める (既存の値は上書きしない)
- `dev-overwrite`: 既存セルもCSV側の値で強制上書きする
  (運営元・サービス・表示名などのメタデータ列に限る。rules/labelsのような
  ルーティングに関わる列には使わない)
