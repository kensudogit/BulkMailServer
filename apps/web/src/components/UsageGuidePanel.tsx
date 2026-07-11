'use client'

import { useCallback, useRef, useState } from 'react'

const techStack = [
  'Next.js',
  'Node · Express',
  'Spring Boot',
  'RabbitMQ',
  'PostgreSQL',
  'Mailpit · SES',
  'Redis',
  'Prometheus',
] as const

const archDiagram = `Console (Next.js :3000)
    │ JWT
    ▼
API (Node :8080 / Java :8090)
    │ campaigns · recipients · reputation
    ├─ PostgreSQL (:5433)   配信ログ・停止リスト
    ├─ Redis                キャッシュ
    └─ RabbitMQ mail.send
         │
         ▼
      Worker (:8081)
         │ MAIL_PROVIDER=smtp|ses
         ▼
   Mailpit / Postfix / Amazon SES
         │
         ├─ Open/Click tracking (/t)
         ├─ Unsubscribe（配信停止はこちら）
         └─ Bounce/Complaint → /webhooks/ses`

const recommendedFlow = [
  'docker compose up -d（Postgres:5433 / Mailpit:1025·8025 / RabbitMQ）',
  'npm install → npm run build -w @bms/shared',
  'npm run dev:api · dev:worker · dev:web',
  'ログイン: admin@example.local / admin1234',
  '受信者リスト作成 → CSV/JSON インポート → キャンペーン送信',
  'Mailpit http://localhost:8025 で到達確認 → 信用スコアで監視',
] as const

const sesShortest = [
  'SES: 送信ドメイン検証（SPF/DKIM）+ サンドボックス解除',
  'IAM で SES SMTP 認証情報を発行',
  'Configuration Set で Bounce/Complaint → SNS Topic',
  'SNS HTTPS 購読: POST https://<api>/webhooks/ses',
  '.env: MAIL_PROVIDER=ses / SES_SMTP_USER / SES_SMTP_PASS / SES_CONFIGURATION_SET',
  'Worker 再起動 → テスト送信 → Bounce 試験で suppress を確認',
] as const

/** AWS SES との対比・評価記事 */
const awsCompareVerdict =
  'Bulk Mail Server（BMS）は SES の代替ではなく、SES の上に載る配信運用レイヤです。配送・IP レピュテーションは AWS に任せ、キャンペーン・停止・キュー・信用スコアは自前で持つ分担が最も合理的です。'

const awsCompareRoles = [
  { area: '配送エンジン', aws: 'SES が SMTP/API で実配送', bms: 'Worker が SES SMTP または Mailpit/Postfix へ中継' },
  { area: '宛先管理', aws: '呼び出し側任せ（Suppression List は限定的）', bms: 'リスト・停止・hard bounce suppress を PG で管理' },
  { area: '送信タイミング', aws: '即時 SendEmail / SMTP', bms: 'RabbitMQ で非同期キュー・再試行しやすい' },
  { area: 'コンテンツ', aws: '生メールを受け取る', bms: 'キャンペーン HTML・配信停止・トラッキング付与' },
  { area: 'Bounce/Complaint', aws: 'Configuration Set → SNS/EventBridge', bms: '/webhooks/ses で取り込み再送防止' },
  { area: 'Open/Click', aws: 'SES イベント（設定次第）', bms: '自前 /t ピクセル・リダイレクト（現状の正）' },
  { area: '信用・運用 UI', aws: 'アカウント全体のレピュテーション', bms: 'キャンペーン単位スコア + DNSBL/SPF' },
  { area: '認証・コンソール', aws: 'AWS Console / IAM', bms: 'JWT + Next.js 運用コンソール' },
] as const

const awsWins = [
  '到達性・IP/ドメインレピュテーションの運用負荷が低い',
  'スケール・送信枠・スロットリングがマネージド',
  'Bounce/Complaint の一次検知が標準で強い',
  'DKIM 署名・ドメイン検証の手順が整備されている',
  '自前 Postfix のウォームアップ・DNSBL 対応が不要',
] as const

const bmsWins = [
  'キャンペーン UI・受信者リスト・CSV インポートが一体',
  '配信停止（List-Unsubscribe）と再送防止がプロダクト機能',
  'キュー（RabbitMQ）でバースト制御・障害切り分けがしやすい',
  'ローカルは Mailpit、本番は SES/Postfix に同じコードで切替',
  '信用スコア・DNSBL 監視を自社指標としてダッシュボード化',
  'Node API と Spring Boot API の並行・ベンダーロック回避',
] as const

const awsEvalScores = [
  { label: '到達性・インフラ', aws: '◎', bms: '△（SES 併用で ◎）', note: '単独 MTA なら BMS 側の運用コスト大' },
  { label: 'キャンペーン運用', aws: '△', bms: '◎', note: 'SES 単体ではリスト/UI が薄い' },
  { label: 'コンプライアンス（停止）', aws: '○', bms: '◎', note: 'BMS が停止リンクと suppress を正とする' },
  { label: '観測・信用スコア', aws: '○', bms: '◎', note: '両方見るのが本番の正解' },
  { label: 'コスト予測', aws: '○（従量）', bms: '○（自前+従量）', note: 'SES 従量 + 自前コンピュート' },
  { label: 'ベンダー依存', aws: '高', bms: '低〜中', note: '配送だけ SES なら依存を局所化できる' },
] as const

const awsCompareConclusion = [
  'SES だけ: トランザクションメールや単純送信向き。大量マーケ運用 UI は別途必要',
  'BMS だけ（自前 SMTP）: 学習・閉域・完全自前 IP 向け。到達性は自責',
  'BMS + SES（推奨）: 運用機能は BMS、配送と一次フィードバックは SES',
  '評価まとめ: 「置き換え」ではなく「役割分担」。SES を配送エンジン、BMS を配信 OS と見る',
] as const

const steps = [
  {
    title: '0. 推奨フロー（ローカル最短）',
    body: '依存サービスは Docker、アプリは npm の 3 プロセス。送信先は Mailpit で確認します。',
    items: [...recommendedFlow],
  },
  {
    title: '0b. SES にする最短手順',
    body: 'ローカル検証後、配送エンジンだけ SES に切り替えます。キャンペーン UI・停止リスト・信用スコアはそのままです。',
    items: [...sesShortest],
  },
  {
    title: '1. 初回セットアップ',
    body: 'リポジトリ直下で環境変数と依存サービスを用意します。',
    items: [
      'cd C:\\devlop\\BulkMailServer',
      'copy .env.example .env（DATABASE_URL は localhost:5433）',
      'docker compose up -d',
      '確認: Postgres healthy / RabbitMQ :15672 / Mailpit :8025',
      '監視系は任意: docker compose --profile obs up -d',
    ],
  },
  {
    title: '2. API / Worker / Web 起動',
    body: '共有パッケージをビルドしてから 3 サービスを起動します。',
    items: [
      'npm install',
      'npm run build -w @bms/shared',
      'npm run dev:api      → http://localhost:8080/health',
      'npm run dev:worker   → mail provider=smtp',
      'npm run dev:web      → http://localhost:3000',
      '任意: cd apps/api-java && mvn spring-boot:run → :8090',
    ],
  },
  {
    title: '3. ログインと受信者',
    body: '初期管理者で入り、リストへ宛先を登録します。停止・suppress 済みは送信対象外です。',
    items: [
      'http://localhost:3000/login',
      'admin@example.local / admin1234',
      '受信者: リスト作成 → POST /recipients/import',
      'CSV 例: email,name の行をインポート',
      '配信停止・hard bounce 済みアドレスは自動スキップ',
    ],
  },
  {
    title: '4. キャンペーン送信',
    body: '件名・HTML を作成し送信開始。Worker がキューから取り出して SMTP/SES へ渡します。',
    items: [
      'キャンペーン作成（from / subject / htmlBody / listId）',
      'HTML に「配信停止はこちら」または {{unsubscribe_url}}',
      '送信開始 → RabbitMQ mail.send に enqueue',
      'List-Unsubscribe / List-Unsubscribe-Post ヘッダ付与',
      'ローカル: Mailpit で本文・ヘッダを確認',
    ],
  },
  {
    title: '5. 配信停止・トラッキング',
    body: '停止リンクと Open/Click 計測で再送防止と指標を集めます。',
    items: [
      'メール内「配信停止はこちら」→ unsubscribed_at',
      'One-Click: List-Unsubscribe-Post',
      'Open: /t/o/:id ピクセル',
      'Click: /t/c/:id リダイレクト',
      '停止後の同一アドレスは再送しない',
    ],
  },
  {
    title: '6. Bounce / Complaint',
    body: 'ハードバウンスと苦情は suppress。SES 利用時は SNS 経由が本番経路です。',
    items: [
      '汎用: POST /webhooks/bounce · /webhooks/complaint',
      'SES: POST /webhooks/ses（SNS SubscriptionConfirmation 対応）',
      'hard bounce → suppress_reason=hard_bounce',
      'complaint → unsubscribe + suppress',
      '信用スコア画面で bounce/complaint 率を監視',
    ],
  },
  {
    title: '7. 信用スコア・DNSBL',
    body: '配信健全性を数値化し、ブラックリストと SPF を点検します。',
    items: [
      'ダッシュボード /reputation（24h 窓）',
      '指標: Delivery / Bounce / Complaint / Open / Click / Score',
      'DNSBL 監視 + SPF TXT 確認（API）',
      '閾値: REPUTATION_*_WARN（.env）',
    ],
  },
  {
    title: '8. Amazon SES 本番切替（詳細）',
    body: 'SMTP インターフェースで SES に接続し、イベントは Configuration Set → SNS で受けます。',
    items: [
      'MAIL_PROVIDER=ses',
      'SES_SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com',
      'SES_SMTP_PORT=587 / SES_SMTP_USER / SES_SMTP_PASS',
      'SES_CONFIGURATION_SET=bms-events（任意だが推奨）',
      'Worker が X-SES-CONFIGURATION-SET と X-BMS-Message-Id を付与',
      'SNS → /webhooks/ses で message 単位の bounce/complaint を突合',
      '自前 Postfix に戻す場合は MAIL_PROVIDER=smtp',
    ],
  },
  {
    title: '9. 本番前チェック',
    body: '到達性とコンプライアンスを確認してから大量送信します。',
    items: [
      '送信ドメインの SPF / DKIM / DMARC',
      '送信 IP の Reverse DNS（自前 MTA 時）',
      'JWT / Unsubscribe シークレットのローテーション',
      'レート制限・ウォームアップ計画',
      'OpenSearch への配信ログ転送（任意 profile obs）',
    ],
  },
] as const

export function UsageGuidePanel() {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const [expanded, setExpanded] = useState(true)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('.usage-guide-toggle')) return
      if (!pos) return
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
      }
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [pos],
  )

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setPos({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    })
  }, [])

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const style =
    pos != null
      ? ({
          position: 'fixed' as const,
          left: pos.x,
          top: pos.y,
          width: 420,
          zIndex: 40,
          margin: 0,
        } as const)
      : undefined

  return (
    <div
      ref={panelRef}
      className={`usage-guide-panel${expanded ? '' : ' is-collapsed'}${dragging ? ' is-dragging' : ''}`}
      style={style}
      role="dialog"
      aria-label="利用手順"
      aria-modal="false"
    >
      <header
        className="usage-guide-header"
        onPointerDown={(e) => {
          if (pos == null && panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect()
            setPos({ x: rect.left, y: rect.top })
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              originX: rect.left,
              originY: rect.top,
            }
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
            return
          }
          onHeaderPointerDown(e)
        }}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className="usage-guide-header-text">
          <span aria-hidden>☰</span>
          <div className="usage-guide-header-titles">
            <strong>利用手順</strong>
            <span className="usage-guide-header-sub">Architecture &amp; Ops</span>
          </div>
          <span className="usage-guide-drag-hint">ドラッグで移動</span>
        </div>
        <button
          type="button"
          className="usage-guide-toggle"
          aria-label={expanded ? '閉じる' : '開く'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▼' : '▲'}
        </button>
      </header>

      {expanded ? (
        <div className="usage-guide-body">
          <div className="usage-guide-hero">
            <p className="usage-guide-hero-kicker">Bulk delivery platform</p>
            <h2 className="usage-guide-hero-title">Bulk Mail Server · Queue → SMTP/SES</h2>
            <p className="usage-guide-hero-lead">
              キャンペーン・受信者・配信停止・Bounce/Complaint・信用スコアを自前で持ち、配送は Mailpit / Postfix /
              Amazon SES に切り替える大量メール基盤です。
            </p>
            <div className="usage-guide-stack" aria-label="Tech stack">
              {techStack.map((tag) => (
                <span key={tag} className="usage-guide-stack-pill">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <section className="usage-guide-featured" aria-label="アーキテクチャ">
            <div className="usage-guide-featured-head">
              <span className="usage-guide-featured-badge">Architecture</span>
              <strong>エンドツーエンド配信</strong>
            </div>
            <p>
              Console → API → RabbitMQ → Worker → SMTP/SES。停止リストと suppress で再送を防ぎ、Open/Click と
              Bounce/Complaint から信用スコアを算出します。
            </p>
          </section>

          <section className="usage-guide-featured" aria-label="SES最短">
            <div className="usage-guide-featured-head">
              <span className="usage-guide-featured-badge">SES</span>
              <strong>SES にする最短手順</strong>
            </div>
            <p>
              ローカルは <code>MAIL_PROVIDER=smtp</code>（Mailpit）。本番配送だけ SES に差し替え、イベントは SNS →{' '}
              <code>/webhooks/ses</code> で取り込みます。
            </p>
            <ul className="usage-guide-items">
              {sesShortest.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="usage-guide-featured" aria-label="推奨フロー">
            <div className="usage-guide-featured-head">
              <span className="usage-guide-featured-badge">Recommended</span>
              <strong>最短・安全な進め方（ローカル）</strong>
            </div>
            <p>
              先に Mailpit で E2E を通し、到達・停止・Bounce Webhook を確認してから SES 認証情報を入れます。大量送信前に
              信用スコアと DNSBL/SPF を見てください。
            </p>
            <ul className="usage-guide-items">
              {recommendedFlow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <article className="usage-guide-article" aria-label="AWS対比評価">
            <div className="usage-guide-featured-head">
              <span className="usage-guide-featured-badge">Evaluation</span>
              <strong>AWS SES 対比評価</strong>
            </div>
            <p className="usage-guide-article-lead">{awsCompareVerdict}</p>

            <h3 className="usage-guide-article-h">1. 役割の対比</h3>
            <p>
              SES は「届ける」、BMS は「誰に・いつ・何を送り、止めるか」を担います。同じレイヤで競合させると、どちらかの強みが死にます。
            </p>
            <div className="usage-guide-compare" role="table" aria-label="役割対比">
              <div className="usage-guide-compare-row usage-guide-compare-head" role="row">
                <span role="columnheader">領域</span>
                <span role="columnheader">AWS SES</span>
                <span role="columnheader">Bulk Mail Server</span>
              </div>
              {awsCompareRoles.map((row) => (
                <div key={row.area} className="usage-guide-compare-row" role="row">
                  <span role="cell">
                    <strong>{row.area}</strong>
                  </span>
                  <span role="cell">{row.aws}</span>
                  <span role="cell">{row.bms}</span>
                </div>
              ))}
            </div>

            <h3 className="usage-guide-article-h">2. AWS が勝る点</h3>
            <ul className="usage-guide-items">
              {awsWins.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 className="usage-guide-article-h">3. BMS が勝る点</h3>
            <ul className="usage-guide-items">
              {bmsWins.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 className="usage-guide-article-h">4. 評価マトリクス</h3>
            <div className="usage-guide-compare usage-guide-compare-scores" role="table" aria-label="評価マトリクス">
              <div className="usage-guide-compare-row usage-guide-compare-head" role="row">
                <span role="columnheader">観点</span>
                <span role="columnheader">SES</span>
                <span role="columnheader">BMS</span>
              </div>
              {awsEvalScores.map((row) => (
                <div key={row.label} className="usage-guide-compare-row" role="row">
                  <span role="cell">
                    <strong>{row.label}</strong>
                    <em className="usage-guide-compare-note">{row.note}</em>
                  </span>
                  <span role="cell">{row.aws}</span>
                  <span role="cell">{row.bms}</span>
                </div>
              ))}
            </div>

            <h3 className="usage-guide-article-h">5. 結論・使い分け</h3>
            <ul className="usage-guide-items">
              {awsCompareConclusion.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="usage-guide-article-foot">
              本番の推奨構成は <strong>BMS + SES</strong>。ローカル検証は Mailpit、配送と Bounce/Complaint の一次ソースは SES、停止リストとキャンペーンの正は
              BMS、という境界を崩さないことが評価上もっとも安全です。
            </p>
          </article>

          <figure className="usage-guide-diagram" aria-label="Service topology">
            <figcaption>Service topology</figcaption>
            <pre>{archDiagram}</pre>
          </figure>

          <p className="usage-guide-scroll-hint">↓ セットアップから本番までの手順</p>

          <ol className="usage-guide-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                <ul className="usage-guide-items">
                  {step.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <p className="usage-guide-footer">
            ▼▲ で開閉 · ドラッグで移動 · AWS 対比は Evaluation 記事 · SES は 0b / 8 · Mailpit :8025
          </p>
        </div>
      ) : null}
    </div>
  )
}
