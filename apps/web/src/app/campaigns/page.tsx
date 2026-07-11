'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Nav } from '@/components/Nav'
import { api } from '@/lib/api'

type Campaign = {
  id: string
  name: string
  subject: string
  status: string
  message_count?: number
  sent_count?: number
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState(
    '<h1>お知らせ</h1><p>本文をここに書きます。</p><p><a href="https://example.com">詳細はこちら</a></p>',
  )
  const [fromEmail, setFromEmail] = useState('noreply@example.local')
  const [listId, setListId] = useState('')
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const data = await api<{ campaigns: Campaign[] }>('/campaigns')
    setCampaigns(data.campaigns)
    const l = await api<{ lists: { id: string; name: string }[] }>('/recipients/lists')
    setLists(l.lists)
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message))
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          subject,
          htmlBody,
          fromEmail,
          listId: listId || undefined,
        }),
      })
      setMsg('キャンペーンを作成しました')
      setName('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function send(id: string) {
    setError('')
    setMsg('')
    try {
      const data = await api<{ enqueued: number }>(`/campaigns/${id}/send`, { method: 'POST' })
      setMsg(`キュー投入: ${data.enqueued} 通`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function aiSuggest(id: string) {
    setError('')
    setMsg('AI 提案を取得中…')
    try {
      const data = await api<{ suggestion: { subject: string; tips: string[] } }>(
        `/campaigns/${id}/ai-suggest`,
        { method: 'POST', body: '{}' },
      )
      setMsg(
        `件名案: ${data.suggestion.subject}\nTips:\n- ${(data.suggestion.tips || []).join('\n- ')}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="shell">
      <Nav />
      <h1>キャンペーン</h1>
      <div className="panel">
        <h2>新規作成</h2>
        <form onSubmit={create}>
          <label>名前</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>件名</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          <label>From</label>
          <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} required />
          <label>リスト（任意）</label>
          <select value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">全受信者（未停止）</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <label>HTML 本文</label>
          <textarea rows={8} value={htmlBody} onChange={(e) => setHtmlBody(e.target.value)} required />
          <div className="row" style={{ marginTop: '1rem' }}>
            <button type="submit">作成</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>一覧</h2>
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>件名</th>
              <th>状態</th>
              <th>件数</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.subject}</td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>
                  {c.sent_count || 0}/{c.message_count || 0}
                </td>
                <td className="row">
                  <button type="button" onClick={() => void send(c.id)}>
                    送信開始
                  </button>
                  <button type="button" className="secondary" onClick={() => void aiSuggest(c.id)}>
                    AI提案
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <pre className="ok">{msg}</pre>}
      {error && <pre className="err">{error}</pre>}
    </div>
  )
}
