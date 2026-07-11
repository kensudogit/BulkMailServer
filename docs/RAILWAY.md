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
REDIS_URL=${{Redis.REDIS_URL}}
RABBITMQ_URL=amqp://guest:guest@<rabbitのプライベートホスト>:5672
API_BASE_URL=https://<このサービスの公開ドメイン>/backend
WEB_BASE_URL=https://<このサービスの公開ドメイン>
NEXT_PUBLIC_API_BASE=/backend
MAIL_PROVIDER=ses
SES_SMTP_USER=...
SES_SMTP_PASS=...
SES_CONFIGURATION_SET=bms-events
```

初回ログイン: `admin@example.local` / `admin1234`

## 分割デプロイ（任意）

`Dockerfile.api` / `Dockerfile.web` / `Dockerfile.worker` と
`railway.web.toml` / `railway.worker.toml` でサービス分割も可能です。
