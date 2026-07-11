import { env } from '../config'

/** 配信停止リンクとトラッキングを HTML に埋め込む */
export function injectComplianceHtml(
  html: string,
  opts: { unsubscribeUrl: string; trackingPixelUrl: string },
): string {
  const footer = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #ddd;font-size:12px;color:#666;text-align:center;">
  <p>本メールの配信を希望されない場合は、以下より配信停止できます。</p>
  <p><a href="${opts.unsubscribeUrl}" style="color:#0b57d0;">配信停止はこちら</a></p>
</div>
<img src="${opts.trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />
`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`)
  }
  return `${html}${footer}`
}

export function buildUnsubscribeUrl(token: string) {
  return `${env.webBaseUrl}/unsubscribe?token=${encodeURIComponent(token)}`
}

export function buildTrackingPixelUrl(messageId: string) {
  return `${env.apiBaseUrl}/t/open/${messageId}.gif`
}

export function wrapTrackedLinks(html: string, messageId: string): string {
  return html.replace(/href=("|')(https?:\/\/[^"']+)\1/gi, (_m, q, url) => {
    if (url.includes('/unsubscribe')) return `href=${q}${url}${q}`
    const tracked = `${env.apiBaseUrl}/t/click/${messageId}?u=${encodeURIComponent(url)}`
    return `href=${q}${tracked}${q}`
  })
}

/** OpenAI で件名・本文の改善案を生成（キー未設定時はローカル提案） */
export async function suggestCopy(input: {
  subject: string
  htmlBody: string
  goal?: string
}): Promise<{ subject: string; tips: string[]; revisedHtml?: string }> {
  if (!env.openaiApiKey) {
    return {
      subject: input.subject,
      tips: [
        '件名は 30 文字前後・具体的な便益を入れる',
        '冒頭 2 行で価値を伝え、CTA を1つに絞る',
        '必ず「配信停止はこちら」をフッターに残す',
      ],
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openaiModel,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'あなたは配信到達率を意識したメールコピーライターです。迷惑メール判定を避ける表現を提案し、JSONで返してください。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            subject: input.subject,
            htmlBody: input.htmlBody.slice(0, 8000),
            goal: input.goal || '開封率とクリック率の改善',
            format: { subject: 'string', tips: ['string'], revisedHtml: 'string?' },
          }),
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI error: ${text}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content || '{}'
  return JSON.parse(content)
}
