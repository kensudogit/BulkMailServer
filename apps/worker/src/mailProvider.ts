import nodemailer, { Transporter } from 'nodemailer'
import { SendJobPayload } from '@bms/shared'

export type MailProvider = 'smtp' | 'ses'

export function resolveProvider(): MailProvider {
  const p = (process.env.MAIL_PROVIDER || 'smtp').toLowerCase()
  return p === 'ses' ? 'ses' : 'smtp'
}

function createSmtpTransport(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 25),
    secure: false,
    tls: { rejectUnauthorized: false },
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
}

/** SES SMTP インターフェース（簡易・認証情報は IAM SMTP ユーザー） */
function createSesSmtpTransport(): Transporter {
  const region = process.env.AWS_REGION || process.env.SES_REGION || 'ap-northeast-1'
  return nodemailer.createTransport({
    host: process.env.SES_SMTP_HOST || `email-smtp.${region}.amazonaws.com`,
    port: Number(process.env.SES_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SES_SMTP_USER || '',
      pass: process.env.SES_SMTP_PASS || '',
    },
  })
}

let transporter: Transporter | null = null

export function getTransporter(): Transporter {
  if (transporter) return transporter
  const provider = resolveProvider()
  transporter = provider === 'ses' ? createSesSmtpTransport() : createSmtpTransport()
  console.log(`[worker] mail provider=${provider}`)
  return transporter
}

export async function sendWithProvider(job: SendJobPayload) {
  const tx = getTransporter()
  const configurationSet = process.env.SES_CONFIGURATION_SET
  const headers: Record<string, string> = {
    'List-Unsubscribe': `<${job.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-BMS-Message-Id': job.messageId,
    'X-BMS-Campaign-Id': job.campaignId,
  }
  // SES イベント公開用（Configuration Set 名）
  if (configurationSet) {
    headers['X-SES-CONFIGURATION-SET'] = configurationSet
  }

  return tx.sendMail({
    from: job.fromEmail,
    to: job.toName ? `"${job.toName}" <${job.toEmail}>` : job.toEmail,
    replyTo: job.replyTo || undefined,
    subject: job.subject,
    html: job.htmlBody,
    text: job.textBody || undefined,
    headers,
  })
}
