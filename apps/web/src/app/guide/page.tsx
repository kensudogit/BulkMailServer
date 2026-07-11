'use client'

import { Nav } from '@/components/Nav'
import { UsageGuidePanel } from '@/components/UsageGuidePanel'

export default function GuidePage() {
  return (
    <div className="shell">
      <Nav />
      <div className="guide-layout">
        <div className="guide-copy">
          <h1>利用手順</h1>
          <p>
            右のパネルはドラッグで移動・開閉できる利用手順です。ローカル起動からキャンペーン送信、配信停止、Bounce/Complaint、
            Amazon SES 切替までをまとめています。
          </p>
          <p>
            <strong>推奨:</strong> まず Docker + Mailpit で E2E を通し、到達と停止リンクを確認してから{' '}
            <code>MAIL_PROVIDER=ses</code> に切り替えます。SES 最短手順はパネルの「0b」と「SES」カードを参照してください。
          </p>
          <p>
            ログイン後の流れは <strong>受信者</strong> → <strong>キャンペーン</strong> → 送信 → Mailpit / SES →{' '}
            <strong>信用スコア</strong> です。初期ユーザーは <code>admin@example.local</code> /{' '}
            <code>admin1234</code>。
          </p>
          <p>
            詳細: リポジトリ直下の <code>README.md</code> · Postgres はホスト <code>:5433</code> · Mailpit UI{' '}
            <code>http://localhost:8025</code> · RabbitMQ <code>http://localhost:15672</code>
          </p>
          <p>
            パネル内の <strong>Evaluation（AWS SES 対比評価）</strong> では、役割分担・強み弱み・評価マトリクス・推奨構成（BMS +
            SES）を記事形式でまとめています。SES は配送エンジン、BMS は配信 OS という見方が結論です。
          </p>
        </div>
        <UsageGuidePanel />
      </div>
    </div>
  )
}
