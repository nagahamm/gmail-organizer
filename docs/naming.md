# ラベルの命名規約

## 単数か複数か

**数えられる名詞は複数形、数えられない名詞は単数形。**

英語の可算 / 不可算がそのまま基準になる。ラベルは「その中に何が入っているか」を
指すので、中身が数えられるなら複数形が自然になる。

| 区分 | 例 | 理由 |
| --- | --- | --- |
| 可算 → **複数形** | `Orders` / `Cards` / `Bills` / `Events` / `Jobs` / `Payslips` / `Accounts` / `Stores` / `Vehicles` / `Codes` / `Alerts` / `Subscriptions` / `Applications` / `Bookings` | 「注文が 3 件」と数えられる |
| 不可算 → **単数形** | `Finance` / `Fashion` / `Travel` / `Beauty` / `Fitness` / `Entertainment` / `Food` / `Furniture` / `Health` / `Security` / `Support` / `Work` / `Personal` / `Tech` | 「ファッションが 3 個」とは言わない |
| ブランド名 | `Amazon` / `Rakuten` / `AWX` / `DMM` | 原語のまま。複数化しない |

### 現行ラベルで直るもの

| 現行 | 修正 | 理由 |
| --- | --- | --- |
| `Entertainments` | `Entertainment` | 不可算。`entertainments` は「催し物」の意味になり、ここでは違う |
| `Creater` | `Creator` | 綴り誤り |
| `Cashback rewards` | `Rewards` | 空白と小文字始まりを排除。`reward` は可算なので複数形 |
| `Meal` | `Food` | `meal` は「一食」を指す。ジャンル名としては不可算の `Food` |
| `Bill` | `Bills` | 可算 |
| `Payslip` | `Payslips` | 可算 |
| `Login` | `Alerts` | ログイン通知は可算。`Login` は動作であってラベル名に向かない |

`Furniture` は不可算なので現行のままで正しい。`Accounts` / `Stores` /
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
