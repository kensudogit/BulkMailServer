# Railway デプロイ手順（Bulk Mail Server）

## 推奨: 一体型サービス（andpad と同じ方式）

ルートの `Dockerfile` が **API + Worker + Web** を 1 コンテナで起動します。
ブラウザは `/backend/*` 経由で同一オリジンの API にアクセスします。

| 項目 | 値 |
|------|-----|
| Root Directory | **空** |
| Dockerfile | `Dockerfile` |
| Config | `/railway.toml` |
| Healthcheck | `/` |

## 今すぐデプロイ（CLI）

```bash
cd C:\devlop\BulkMailServer
railway login
railway init
railway add --database postgres
railway add --database redis
# Dashboard で RabbitMQ イメージサービスを追加
railway up
railway domain
```

## GitHub 連携（Dashboard）

1. https://railway.app/new → Deploy from GitHub repo
2. `kensudogit/BulkMailServer` を選択
3. Postgres / Redis を Add Plugin
4. RabbitMQ: New Service → Docker Image → `rabbitmq:3-management-alpine`
5. 変数を設定して Deploy

## 必須変数

```text
JWT_SECRET=<32文字以上>
UNSUBSCRIBE_TOKEN_SECRET=<32文字以上>
DATABASE_URL=${{Postgres.DATABASE_URL}}
API_BASE_URL=https://<このサービスの公開ドメイン>/backend
WEB_BASE_URL=https://<このサービスの公開ドメイン>
NEXT_PUBLIC_API_BASE=/backend
QUEUE_BACKEND=postgres
RABBITMQ_URL=disabled
# 一体型の内部ポート（通常は変更不要）
# API_PORT=8081 / WORKER_METRICS_PORT=8082 / PORT は Railway が注入
REDIS_URL=${{Redis.REDIS_URL}}   # 任意（無くても起動可）
MAIL_PROVIDER=ses                # または smtp（要 SMTP_*）
```

ポート割り当て（一体型）:

| プロセス | ポート | 備考 |
|---------|--------|------|
| Web (Next.js) | `$PORT`（Railway） | 公開・ヘルスチェック `/` |
| API | `8081` | 内部。`/backend` から rewrite |
| Worker metrics | `8082` | 内部 |

## 分割デプロイ（任意）

`Dockerfile.api` / `Dockerfile.web` / `Dockerfile.worker` と
`railway.web.toml` / `railway.worker.toml` でサービス分割も可能です。
