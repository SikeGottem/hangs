import { NextResponse } from 'next/server'
import { getDb, ensureSchema } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    await ensureSchema()

    const totalHangs = ((await db.execute('SELECT COUNT(*) as cnt FROM hangs')).rows[0].cnt as number) || 0
    const confirmedHangs = ((await db.execute("SELECT COUNT(*) as cnt FROM hangs WHERE status = 'confirmed'")).rows[0].cnt as number) || 0
    const totalParticipants = ((await db.execute('SELECT COUNT(DISTINCT name) as cnt FROM participants')).rows[0].cnt as number) || 0

    const favRes = await db.execute("SELECT confirmed_activity as name, COUNT(*) as cnt FROM hangs WHERE confirmed_activity IS NOT NULL AND confirmed_activity != '' GROUP BY confirmed_activity ORDER BY cnt DESC LIMIT 1")
    const mostVotedRes = await db.execute("SELECT a.name, COUNT(*) as votes FROM activity_votes av JOIN activities a ON a.id = av.activity_id WHERE av.vote = 'up' GROUP BY a.name ORDER BY votes DESC LIMIT 1")
    const reliableRes = await db.execute("SELECT p.name, COUNT(CASE WHEN av.status = 'free' THEN 1 END) as free_count, COUNT(*) as total FROM participants p JOIN availability av ON av.participant_id = p.id GROUP BY p.name HAVING total >= 5 ORDER BY CAST(free_count AS REAL) / total DESC LIMIT 1")
    const recentRes = await db.execute("SELECT h.id, h.name, h.status, h.created_at, (SELECT COUNT(*) FROM participants WHERE hang_id = h.id) as participant_count FROM hangs h ORDER BY h.created_at DESC LIMIT 5")

    return NextResponse.json({
      totalHangs, confirmedHangs, totalParticipants,
      favouriteActivity: (favRes.rows[0]?.name as string) || null,
      mostVotedActivity: (mostVotedRes.rows[0]?.name as string) || null,
      mostReliable: (reliableRes.rows[0]?.name as string) || null,
      recentHangs: recentRes.rows,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
