# Bulk Mail Server

大量メール送信サーバ一式（API / Worker / Web コンソール / インフラ）です。

## アーキテクチャ

```text
Next.js Console ──JWT──▶ Node API (Express)
                           │
                           ├─ PostgreSQL（キャンペーン・配信ログ・停止リスト）
                           ├─ Redis（信用スコアキャッシュ）
                           ├─ RabbitMQ（mail.send キュー）
                           ├─ S3/MinIO（将来の添付・テンプレ保存）
                           └─ Prometheus metrics
                                │
                                ▼
                         Worker (SMTP → Postfix)
                                │
                                ▼
                    Open / Click tracking
                    Bounce / Complaint webhook
                    Unsubscribe（再送防止）
```

## 実装済み機能

| 領域 | 内容 |
|------|------|
| 認証 | JWT（ログイン / 登録） |
| キャンペーン | 作成・キュー投入・AI 件名提案（OpenAI 任意） |
| 受信者 | リスト・CSV インポート |
| 配信停止 | メール内「配信停止はこちら」+ List-Unsubscribe ヘッダ。停止後は再送しない |
| Bounce | `/webhooks/bounce` → hard bounce は suppress |
| Complaint | `/webhooks/complaint` → 停止 + suppress |
| トラッキング | Open ピクセル / Click リダイレクト |
| 信用スコア | Bounce / Complaint / Open / Click / Delivery 率とスコア |
| ブラックリスト | DNSBL 監視 + SPF TXT 確認 |
| 監視 | `/metrics`（Prometheus）+ Grafana / OpenSearch（compose） |

## 起動手順

### 1. 依存サービス

```bash
cd C:\devlop\BulkMailServer
copy .env.example .env
docker compose up -d
```

確認:
- PostgreSQL `localhost:5432`
- RabbitMQ UI `http://localhost:15672`（bms / bms_secret）
- MinIO `http://localhost:9001`
- Grafana `http://localhost:3001`（admin / admin）
- Prometheus `http://localhost:9090`
- OpenSearch `http://localhost:9200`

### 2. アプリ

```bash
npm install
npm run build -w @bms/shared
npm run dev:api      # :8080
npm run dev:worker   # SMTP + metrics :8081
npm run dev:web      # :3000
```

### 3. ログイン

- URL: http://localhost:3000/login
- 初期ユーザー: `admin@example.local` / `admin1234`

## 典型フロー

1. **受信者**でリスト作成・CSV インポート
2. **キャンペーン**で件名・HTML 作成 → **送信開始**
3. Worker が RabbitMQ から取得し Postfix 経由で送信
4. メール内の「配信停止はこちら」で停止登録（以降スキップ）
5. **信用スコア**で Bounce/Complaint/Open/Click/Delivery を監視
6. DNSBL / SPF チェックで送信ドメイン健全性を確認

## Webhook 例

```bash
# Bounce
curl -X POST http://localhost:8080/webhooks/bounce \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"bad@example.com\",\"bounceType\":\"hard\",\"diagnostic\":\"550 user unknown\"}"

# Complaint
curl -X POST http://localhost:8080/webhooks/complaint \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"feedbackType\":\"abuse\"}"
```

## 本番前チェックリスト

- [ ] 送信ドメインの **SPF / DKIM / DMARC**
- [ ] 送信 IP の **Reverse DNS (PTR)**
- [ ] Postfix または PowerMTA / Amazon SES の本番接続
- [ ] JWT / Unsubscribe シークレットのローテーション
- [ ] Bounce/Complaint の本番 Webhook（SES SNS 等）接続
- [ ] レート制限・ウォームアップ計画
- [ ] OpenSearch への配信ログ転送（Filebeat 等）

## ディレクトリ

```text
BulkMailServer/
  apps/api       API
  apps/worker    配信ワーカー
  apps/web       Next.js コンソール
  packages/shared 共有型
  sql/init.sql   DB スキーマ
  infra/         Prometheus 等
  docker-compose.yml
```

## ライセンス

Private / internal use.
# BulkMailServer
