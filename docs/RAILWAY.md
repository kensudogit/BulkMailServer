# Railway デプロイ手順（Bulk Mail Server）

## 構成

| Service | Dockerfile | 公開 | 役割 |
|---------|------------|------|------|
| api | `Dockerfile.api` | はい | REST / Webhook / JWT |
| web | `Dockerfile.web` | はい | Next.js コンソール |
| worker | `Dockerfile.worker` | いいえ | RabbitMQ → SMTP/SES |
| Postgres | Railway plugin | 内部 | DB |
| Redis | Railway plugin | 内部 | キャッシュ |
| RabbitMQ | `rabbitmq:3-management-alpine` | 内部 | キュー |

## CLI（ログイン後）

```bash
cd C:\devlop\BulkMailServer
railway login
railway init          # または既存プロジェクトを link
railway add --database postgres
railway add --database redis
# RabbitMQ は Dashboard で Docker Image サービスを追加
```

## 必須変数（api / worker 共通）

```text
JWT_SECRET=<32文字以上>
UNSUBSCRIBE_TOKEN_SECRET=<32文字以上>
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
RABBITMQ_URL=amqp://guest:guest@rabbitmq.railway.internal:5672
API_BASE_URL=https://<apiの公開ドメイン>
WEB_BASE_URL=https://<webの公開ドメイン>
MAIL_PROVIDER=ses
AWS_REGION=ap-northeast-1
SES_SMTP_USER=...
SES_SMTP_PASS=...
SES_CONFIGURATION_SET=bms-events
```

## web 変数

```text
NEXT_PUBLIC_API_BASE=https://<apiの公開ドメイン>
```

ビルド時引数としても同じ値を渡す（Dockerfile.web の ARG）。

## GitHub 連携

1. このリポジトリを push
2. Railway Dashboard → New Project → Deploy from GitHub
3. サービスごとに Dockerfile Path を設定
4. Generate Domain で api / web を公開

## 初回スキーマ

API 起動時に `sql/init.sql` を自動適用します（`IF NOT EXISTS`）。
