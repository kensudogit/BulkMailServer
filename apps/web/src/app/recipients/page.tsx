'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Nav } from '@/components/Nav'
import { api } from '@/lib/api'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function RecipientsPage() {
  useAuthGuard({ requireAuth: true })
  const [listName, setListName] = useState('')
  const [csv, setCsv] = useState('user1@example.com,太郎\nuser2@example.com,花子')
  const [lists, setLists] = useState<{ id: string; name: string; recipient_count?: number }[]>([])
  const [listId, setListId] = useState('')
  const [recipients, setRecipients] = useState<
    { id: string; email: string; name: string | null; unsubscribed_at: string | null; suppressed_at: string | null }[]
  >([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const l = await api<{ lists: typeof lists }>('/recipients/lists')
    setLists(l.lists)
    const q = listId ? `?listId=${listId}` : ''
    const r = await api<{ recipients: typeof recipients }>(`/recipients${q}`)
    setRecipients(r.recipients)
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message))
  }, [listId])

  async function createList(e: FormEvent) {
    e.preventDefault()
    await api('/recipients/lists', { method: 'POST', body: JSON.stringify({ name: listName }) })
    setListName('')
    setMsg('リストを作成しました')
    await reload()
  }

  async function importRecipients(e: FormEvent) {
    e.preventDefault()
    const recipientsPayload = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, name] = line.split(',').map((s) => s.trim())
        return { email, name }
      })
    const data = await api<{ imported: number }>('/recipients/import', {
      method: 'POST',
      body: JSON.stringify({ listId: listId || undefined, recipients: recipientsPayload }),
    })
    setMsg(`${data.imported} 件インポート`)
    await reload()
  }

  return (
    <div className="shell">
      <Nav />
      <h1>受信者</h1>
      <div className="panel">
        <h2>リスト作成</h2>
        <form onSubmit={createList} className="row">
          <input
            style={{ flex: 1 }}
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="リスト名"
            required
          />
          <button type="submit">作成</button>
        </form>
        <ul>
          {lists.map((l) => (
            <li key={l.id}>
              {l.name}（{l.recipient_count || 0}）
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h2>CSV インポート（email,name）</h2>
        <form onSubmit={importRecipients}>
          <label>対象リスト</label>
          <select value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">なし</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <label>データ</label>
          <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="row" style={{ marginTop: '1rem' }}>
            <button type="submit">インポート</button>
          </div>
        </form>
      </div>
      <div className="panel">
        <h2>受信者一覧</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.name || '-'}</td>
                <td>
                  {r.unsubscribed_at ? (
                    <span className="badge warn">配信停止</span>
                  ) : r.suppressed_at ? (
                    <span className="badge danger">抑制</span>
                  ) : (
                    <span className="badge ok">有効</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="ok">{msg}</p>}
      {error && <p className="err">{error}</p>}
    </div>
  )
}
