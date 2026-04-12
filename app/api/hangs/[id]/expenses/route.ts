import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const expRes = await db.execute({
      sql: 'SELECT e.id, e.description, e.amount, e.paid_by, e.split_between, e.created_at, p.name as paid_by_name FROM expenses e JOIN participants p ON p.id = e.paid_by WHERE e.hang_id = ? ORDER BY e.created_at ASC',
      args: [id],
    })
    const expenses = expRes.rows as any[]

    const partRes = await db.execute({ sql: 'SELECT id, name FROM participants WHERE hang_id = ?', args: [id] })
    const participants = partRes.rows as any[]
    const totalPeople = participants.length

    const balances: Record<string, number> = {}
    for (const p of participants) balances[p.name] = 0

    for (const e of expenses) {
      const splitCount = e.split_between ? JSON.parse(e.split_between).length : totalPeople
      const perPerson = e.amount / splitCount
      balances[e.paid_by_name] = (balances[e.paid_by_name] || 0) + e.amount - perPerson
      const splitNames = e.split_between ? JSON.parse(e.split_between) : participants.map(p => p.name)
      for (const name of splitNames) {
        if (name !== e.paid_by_name) balances[name] = (balances[name] || 0) - perPerson
      }
    }

    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
    return NextResponse.json({ expenses, balances, totalSpent, perPerson: totalPeople > 0 ? totalSpent / totalPeople : 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { description, amount, paidBy, splitBetween } = await req.json()
    if (!description || !amount || !paidBy) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const db = getDb()
    await ensureSchema()
    await db.execute({
      sql: 'INSERT INTO expenses (hang_id, description, amount, paid_by, split_between) VALUES (?, ?, ?, ?, ?)',
      args: [id, description, amount, paidBy, splitBetween ? JSON.stringify(splitBetween) : null],
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
