# ワークノート管理（管理者用アプリ）

従業員用 iPhone アプリ「ワークノート」（Ginro540/WorkNote）の管理者用アプリです。
仕様は [docs/仕様書.html](docs/仕様書.html) を参照してください。

- **Web アプリ**（`web/`）：React・TypeScript（Vite）、Firebase JS SDK、Mantine。iPad・Mac・PC のブラウザで使う
- **専用アプリ**（`ios/`）：iPad・Mac（Mac Catalyst）で Web アプリを WKWebView で表示する。見積書の PDF は端末の機能で作って共有する
- **Firebase**（`firebase/`）：Firestore のセキュリティルール（従業員アプリと共通。**こちらが正本**）、Hosting の設定

Firebase プロジェクトは従業員アプリと同じ `worknote-6dc51`（Spark プラン）です。

## フォルダ構成

| パス | 中身 |
| --- | --- |
| `web/src/core/` | WorkNoteCore（Swift）の移植：休憩・実働、締め日、修正申請の期限 |
| `web/src/data/` | Firestore のデータの形（`models.ts`）、管理者の書き込み（`actions.ts`）、集計 |
| `web/src/pages/` | 画面 |
| `ios/` | 専用アプリ（XcodeGen の `project.yml`） |
| `firebase/firestore.rules` | セキュリティルール（従業員用のルールに管理者の条件を足したもの） |
| `firebase/rules-test/` | ルールのテスト（Firestore エミュレーター） |
| `tools/core-golden/` | Swift の WorkNoteCore で計算した正解データを作るツール |
| `scripts/make-icon.swift` | アイコン（従業員アプリと同じ絵柄で背景を紺にしたもの） |

## Web アプリ

```sh
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # 計算ロジックのテスト（Swift 版と同じ結果になるか）
npm run build      # firebase/hosting/ に出力
```

### 計算が従業員アプリとずれていないかの確認

`web/src/core/golden.json` は、Swift の WorkNoteCore に勤怠のパターン 3000件・締め日 11種類・期限 500件を通した結果です。
WorkNoteCore を変えたら作り直してテストします（WorkNote リポジトリを隣に置く）。

```sh
cd tools/core-golden
DEVELOPER_DIR=/Applications/Xcode-27.1.0.app/Contents/Developer swift run core-golden ../../web/src/core/golden.json
cd ../../web && npm test
```

## 公開（Firebase Hosting）

```sh
cd web && npm run build
cd ../firebase && firebase deploy --only hosting      # https://worknote-6dc51.web.app
```

## セキュリティルール

```sh
cd firebase/rules-test && npm install && npm test     # エミュレーターでテスト（Java が必要）
cd .. && firebase deploy --only firestore:rules
```

ルールはプロジェクトに1つだけです。従業員アプリのリポジトリの `firebase/firestore.rules` から反映すると管理者の条件が消えるので、反映はこのリポジトリから行います。

## 専用アプリ（iPad・Mac）

```sh
cd ios
xcodegen generate
open WorkNoteAdmin.xcodeproj
```

- Info.plist の `WorkNoteAdminURL`（初期値 `https://worknote-6dc51.web.app`）を表示します
- 開発中は、スキームの環境変数 `WORKNOTE_ADMIN_URL=http://localhost:5173` で手元のサーバーを表示できます
- Signing & Capabilities で会社の Team を選んでください

## 管理者アカウントの発行

最初の管理者は、従業員アプリのスクリプトで発行します（ターミナル.app で実行）。

```sh
cd ~/WorkNote/firebase/seed && npm run create-user -- <email> '<password>' '<名前>' admin
```

2人目からは、管理者アプリの「マスタ → 従業員」で追加できます。

## 仕様の決め方（従業員アプリとの関係）

| 項目 | 実装 |
| --- | --- |
| 日報の差し戻し | `status: draft` に戻し、`returnReason`・`returnedBy`・`returnedAt` を記録（従業員アプリに「差し戻し」の状態がないため） |
| 経費の差し戻し | `status: returned` と `returnReason`（従業員アプリに表示される） |
| 修正申請の承認 | 対象の打刻の時刻を書き換え、ない打刻は追加（`corrected: true`・`correctionId`・元の時刻 `originalPunchedAt`） |
| 管理者の直接修正 | `correctedBy`・`correctedAt`・`correctionReason` を記録。削除は `punchDeletions` に削除前の内容を残す |
| 休憩の修正 | 管理者が承認済みの「休憩を取れなかった」（`createdBy` 付き）を作る |
| 見積番号 | `settings/estimateCounter` で年ごとに連番（`2026-0001`） |

## ローカルで確かめる（エミュレーター）

本番には触れず、パソコンの中の Firebase で動かします。3つのターミナルで順に実行します。

```
cd firebase && firebase emulators:start --project demo-worknote   # Java が必要
node scripts/seed-emulator.mjs                                   # テスト用のデータを入れる（やり直すときも）
cd web && npm run dev:emulator                                   # http://127.0.0.1:5174
```

ログインは admin@example.com / password。データは http://127.0.0.1:4000 で見られます。
