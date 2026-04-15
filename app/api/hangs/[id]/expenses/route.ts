// /api/hangs/[id]/expenses — GET (public), POST (token-authenticated)
import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ExpenseSchema, parseBody } from '@/lib/schemas'
import { serverError, badRequest, unauthorized } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const [expRes, partRes] = await db.batch(
      [
        {
          sql: 'SELECT e.id, e.description, e.amount, e.paid_by, e.split_between, e.created_at, p.name as paid_by_name FROM expenses e JOIN participants p ON p.id = e.paid_by WHERE e.hang_id = ? ORDER BY e.created_at ASC',
          args: [id],
        },
        { sql: 'SELECT id, name FROM participants WHERE hang_id = ?', args: [id] },
      ],
      'read',
    )
    const expenses = expRes.rows as any[]
    const participants = partRes.rows as any[]
    const totalPeople = participants.length

    const balances: Record<string, number> = {}
    for (const p of participants) balances[p.name] = 0
    for (const e of expenses) {
      let splitBetween: string[] | null = null
      try {
        splitBetween = e.split_between ? JSON.parse(e.split_between) : null
      } catch {
        splitBetween = null
      }
      const splitCount = splitBetween ? splitBetween.length : totalPeople
      const perPerson = e.amount / Math.max(splitCount, 1)
      balances[e.paid_by_name] = (balances[e.paid_by_name] || 0) + e.amount - perPerson
      const splitNames = splitBetween || participants.map(p => p.name)
      for (const name of splitNames) {
        if (name !== e.paid_by_name) balances[name] = (balances[name] || 0) - perPerson
      }
    }
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
    return NextResponse.json({
      expenses,
      balances,
      totalSpent,
      perPerson: totalPeople > 0 ? totalSpent / totalPeople : 0,
    })
  } catch (e) {
    return serverError(e, 'GET /expenses')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const raw = await req.json()
    const auth = await requireAuth(req, id, raw)
    if (!auth) return unauthorized()

    const parsed = parseBody(raw, ExpenseSchema)
    if ('error' in parsed) return badRequest(parsed.error)
    const { description, amount, splitBetween } = parsed.data

    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: 'INSERT INTO expenses (hang_id, description, amount, paid_by, split_between) VALUES (?, ?, ?, ?, ?)',
      args: [id, description, amount, auth.sub, splitBetween ? JSON.stringify(splitBetween) : null],
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverError(e, 'POST /expenses')
  }
}
