// Crew creation — a compact two-step setup with optional invitations.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import product from '@/app/product.module.css'

type InviteResult = { email: string; ok: boolean; devLink?: string }
type CreateCrewResponse = { crew: { id: string }; invited?: InviteResult[] }

export default function NewCrew() {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emailsText, setEmailsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<{ user: unknown } | null>(null)
  const [devLinks, setDevLinks] = useState<{ email: string; link: string }[] | null>(null)
  const [createdCrewId, setCreatedCrewId] = useState<string | null>(null)
  useEffect(() => { fetch('/api/me').then(r => r.json()).then(setMe) }, [])
  useEffect(() => { if (me && !me.user) router.replace('/login?redirect=/crews/new') }, [me, router])
  const emails = emailsText.split(/[\s,;\n]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/crews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, inviteEmails: emails.length ? emails : undefined }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`) }
      const { crew, invited } = await res.json() as CreateCrewResponse
      const links = (invited || []).filter((invite) => invite.ok && invite.devLink).map((invite) => ({ email: invite.email, link: invite.devLink! }))
      if (links.length) { setDevLinks(links); setCreatedCrewId(crew.id); return }
      router.push(`/crews/${crew.id}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong') } finally { setLoading(false) }
  }
  if (!me || !me.user) return null
  if (devLinks && createdCrewId) return <InviteLinks links={devLinks} onContinue={() => router.push(`/crews/${createdCrewId}`)} />

  return (
    <div className={product.pageNarrow}>
      <header className={product.stepHeader}>
        <div className={product.stepTrack} aria-label={`Step ${step + 1} of 2`}><span data-active="true" /><span data-active={step === 1} /></div>
        <span className={product.eyebrow}>Step {step + 1} of 2</span>
        <h1 className={product.title}>{step === 0 ? 'Give the group a home.' : 'Bring in the usual suspects.'}</h1>
        <p className={product.lede}>{step === 0 ? 'Set the name everyone will recognise. You can keep the description loose.' : 'Invite people now, or make the crew first and add them once you are in.'}</p>
      </header>
      {step === 0 ? <div className={product.form}>
        <label className={product.field}><span className={product.fieldLabel}>Crew name</span><input className={product.control} value={name} onChange={e => setName(e.target.value)} placeholder="UNSW Climbing Society" maxLength={80} /></label>
        <label className={product.field}><span className={product.fieldLabel}>A little context <em>(optional)</em></span><textarea className={product.textArea} value={description} onChange={e => setDescription(e.target.value)} placeholder="Weekly bouldering + beer" maxLength={400} rows={3} /></label>
        <div className={product.actions}><button className="btn-secondary" onClick={() => router.back()}>Cancel</button><button className="btn-primary" onClick={() => setStep(1)} disabled={!name.trim()}>Continue <span aria-hidden="true">→</span></button></div>
      </div> : <div className={product.form}>
        <label className={product.field}><span className={product.fieldLabel}>Member emails <em>(optional)</em></span><textarea className={product.textArea} value={emailsText} onChange={e => setEmailsText(e.target.value)} placeholder={'sarah@unsw.edu.au\nnoah@example.com'} rows={6} /><span className={product.fieldHint}>Separate emails with spaces, commas, or new lines.{emails.length > 0 && <strong> {emails.length} valid email{emails.length === 1 ? '' : 's'}.</strong>}</span></label>
        {error && <div className={product.error} role="alert">{error}</div>}
        <div className={product.actions}><button className="btn-secondary" onClick={() => setStep(0)} disabled={loading}>Back</button><button className="btn-primary" onClick={handleCreate} disabled={loading}>{loading ? 'Creating…' : emails.length ? `Create & invite ${emails.length}` : 'Create crew'}</button></div>
      </div>}
    </div>
  )
}

function InviteLinks({ links, onContinue }: { links: { email: string; link: string }[]; onContinue: () => void }) {
  return <div className={product.pageNarrow}><header className={product.stepHeader}><span className={product.eyebrow}>Crew created</span><h1 className={product.title}>The invite is in your hands.</h1><p className={product.lede}>Email is not configured, so copy each personal link into the group chat or a DM.</p></header><section className={product.section}><div className={product.sectionHeader}><h2 className={product.sectionTitle}>Invite links</h2></div>{links.map(link => <DevLinkRow key={link.email} {...link} />)}</section><button className="btn-primary" onClick={onContinue}>Continue to crew</button></div>
}

function DevLinkRow({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* Clipboard access can be unavailable. */ } }
  return <div className={product.inviteRow}><div><strong>{email}</strong><code>{link}</code></div><button className={product.smallButton} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
}
