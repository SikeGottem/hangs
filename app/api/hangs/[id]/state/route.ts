// GET /api/hangs/[id]/state — everything the results page needs in ONE batched read.
// Replaces ~12 parallel endpoint calls (hang, comments, transport, bring-list, expenses,
// polls, rsvp, reactions, heatmap, confirm) with a single network round-trip.
// Photos and weather are excluded deliberately — photos are large payloads and only
// needed for the recap section, weather is an external API call.
import { NextResponse } from 'next/server'
import { getDb, ensureSchema, synthesiseFromData } from '@/lib/db'
import { serverError } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    await ensureSchema()

    const [
      hangRes,
      partRes,
      actRes,
      availRes,
      commentsRes,
      transportRes,
      bringItemsRes,
      bringClaimsRes,
      expensesRes,
      rsvpRes,
      reactionsRes,
      confirmVotesRes,
      pollsRes,
      pollOptionsRes,
      pollVotesRes,
      commitRes,
    ] = await db.batch([
      { sql: 'SELECT * FROM hangs WHERE id = ?', args: [id] },
      { sql: 'SELECT * FROM participants WHERE hang_id = ? ORDER BY created_at', args: [id] },
      {
        sql: `SELECT a.*,
          SUM(CASE WHEN av.vote = 'up' THEN 1 ELSE 0 END) as ups,
          SUM(CASE WHEN av.vote = 'meh' THEN 1 ELSE 0 END) as mehs,
          SUM(CASE WHEN av.vote = 'down' THEN 1 ELSE 0 END) as downs
        FROM activities a LEFT JOIN activity_votes av ON av.activity_id = a.id
        WHERE a.hang_id = ? GROUP BY a.id`,
        args: [id],
      },
      { sql: 'SELECT participant_id, date, hour, status FROM availability WHERE hang_id = ?', args: [id] },
      {
        sql: `SELECT c.id, c.text, c.created_at, p.name as author FROM comments c
              JOIN participants p ON p.id = c.participant_id WHERE c.hang_id = ? ORDER BY c.created_at ASC`,
        args: [id],
      },
      {
        sql: `SELECT t.mode, t.seats, p.name FROM transport t
              JOIN participants p ON p.id = t.participant_id WHERE t.hang_id = ?`,
        args: [id],
      },
      {
        sql: 'SELECT id, parent_id, item, created_at FROM bring_list WHERE hang_id = ? ORDER BY created_at ASC',
        args: [id],
      },
      {
        sql: `SELECT blc.item_id, blc.note, p.name, p.id as participant_id
              FROM bring_list_claims blc
              JOIN participants p ON p.id = blc.participant_id
              JOIN bring_list bl ON bl.id = blc.item_id
              WHERE bl.hang_id = ?`,
        args: [id],
      },
      {
        sql: `SELECT e.id, e.description, e.amount, e.paid_by, e.split_between, e.created_at,
              p.name as paid_by_name FROM expenses e
              JOIN participants p ON p.id = e.paid_by
              WHERE e.hang_id = ? ORDER BY e.created_at ASC`,
        args: [id],
      },
      {
        sql: `SELECT r.status, p.name FROM rsvp r
              JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?`,
        args: [id],
      },
      {
        sql: `SELECT r.emoji, p.name FROM reactions r
              JOIN participants p ON p.id = r.participant_id WHERE r.hang_id = ?`,
        args: [id],
      },
      {
        sql: `SELECT cv.vote, p.name FROM confirm_votes cv
              JOIN participants p ON p.id = cv.participant_id WHERE cv.hang_id = ?`,
        args: [id],
      },
      { sql: 'SELECT * FROM polls WHERE hang_id = ? ORDER BY created_at DESC', args: [id] },
      {
        sql: `SELECT po.id, po.poll_id, po.text,
              (SELECT COUNT(*) FROM poll_votes pv WHERE pv.poll_option_id = po.id) as votes
              FROM poll_options po
              JOIN polls p ON p.id = po.poll_id
              WHERE p.hang_id = ?`,
        args: [id],
      },
      {
        sql: `SELECT pv.poll_option_id, p.name, po.poll_id FROM poll_votes pv
              JOIN participants p ON p.id = pv.participant_id
              JOIN poll_options po ON po.id = pv.poll_option_id
              JOIN polls pl ON pl.id = po.poll_id
              WHERE pl.hang_id = ?`,
        args: [id],
      },
      { sql: 'SELECT participant_id, level FROM commitment WHERE hang_id = ?', args: [id] },
    ], 'read')

    const hang = hangRes.rows[0]
    if (!hang) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Participants + synthesis ──
    const respondedIds = new Set(availRes.rows.map(r => r.participant_id as string))
    const participants = partRes.rows.map(p => ({
      ...p,
      hasResponded: respondedIds.has(p.id as string),
    }))
    const totalParticipants = partRes.rows.length

    const commitmentRows = commitRes.rows.map(r => ({
      participant_id: r.participant_id as string,
      level: r.level as 'in' | 'probably' | 'cant',
    }))

    const synthesis = synthesiseFromData(
      partRes.rows.map(r => ({ id: r.id as string, name: r.name as string })),
      availRes.rows.map(r => ({
        participant_id: r.participant_id as string,
        date: r.date as string,
        hour: r.hour as number,
        status: r.status as string,
      })),
      actRes.rows.map(r => ({
        id: r.id as number,
        name: r.name as string,
        ups: (r.ups as number) || 0,
        downs: (r.downs as number) || 0,
      })),
      commitmentRows,
    )

    // Aggregate commitment for the UI: { in, probably, cant } counts + named list
    const commitmentAgg = { in: 0, probably: 0, cant: 0, unknown: 0 }
    const commitmentByParticipant: Record<string, 'in' | 'probably' | 'cant'> = {}
    for (const c of commitmentRows) {
      commitmentAgg[c.level]++
      commitmentByParticipant[c.participant_id] = c.level
    }
    commitmentAgg.unknown = totalParticipants - commitmentAgg.in - commitmentAgg.probably - commitmentAgg.cant

    // ── Bring list tree ──
    const claimsByItem: Record<number, any[]> = {}
    for (const c of bringClaimsRes.rows) {
      const itemId = c.item_id as number
      if (!claimsByItem[itemId]) claimsByItem[itemId] = []
      claimsByItem[itemId].push({ name: c.name, participantId: c.participant_id, note: c.note })
    }
    const topLevel = bringItemsRes.rows.filter(i => !i.parent_id)
    const subItems = bringItemsRes.rows.filter(i => i.parent_id)
    const bringList = topLevel.map(item => ({
      id: item.id,
      item: item.item,
      claims: claimsByItem[item.id as number] || [],
      subItems: subItems
        .filter(s => s.parent_id === item.id)
        .map(s => ({
          id: s.id,
          item: s.item,
          claims: claimsByItem[s.id as number] || [],
        })),
    }))

    // ── Expenses w/ balances ──
    const expenses = expensesRes.rows as any[]
    const balances: Record<string, number> = {}
    for (const p of partRes.rows) balances[p.name as string] = 0
    for (const e of expenses) {
      const splitBetween = e.split_between ? JSON.parse(e.split_between) : null
      const splitCount = splitBetween ? splitBetween.length : totalParticipants
      const perPerson = e.amount / splitCount
      balances[e.paid_by_name] = (balances[e.paid_by_name] || 0) + e.amount - perPerson
      const splitNames = splitBetween || partRes.rows.map(p => p.name as string)
      for (const name of splitNames) {
        if (name !== e.paid_by_name) balances[name] = (balances[name] || 0) - perPerson
      }
    }
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
    const expenseData = {
      expenses,
      balances,
      totalSpent,
      perPerson: totalParticipants > 0 ? totalSpent / totalParticipants : 0,
    }

    // ── Polls (stitch options + voters client-side into poll objects) ──
    const optionsByPoll: Record<number, any[]> = {}
    for (const opt of pollOptionsRes.rows) {
      const pid = opt.poll_id as number
      if (!optionsByPoll[pid]) optionsByPoll[pid] = []
      optionsByPoll[pid].push({ id: opt.id, text: opt.text, votes: opt.votes || 0 })
    }
    const votersByPoll: Record<number, any[]> = {}
    for (const v of pollVotesRes.rows) {
      const pid = v.poll_id as number
      if (!votersByPoll[pid]) votersByPoll[pid] = []
      votersByPoll[pid].push({ poll_option_id: v.poll_option_id, name: v.name })
    }
    const polls = pollsRes.rows.map(p => ({
      ...p,
      options: optionsByPoll[p.id as number] || [],
      voters: votersByPoll[p.id as number] || [],
    }))

    // ── Confirm votes summary ──
    const yesCount = confirmVotesRes.rows.filter(v => v.vote === 'yes').length
    const threshold = Math.ceil(totalParticipants / 2)
    const confirmVotes = {
      votes: confirmVotesRes.rows,
      yesCount,
      totalParticipants,
      threshold,
      met: yesCount >= threshold,
    }

    // ── Heatmap (same data as availability, just aggregated) ──
    const participantNameById: Record<string, string> = {}
    for (const p of partRes.rows) participantNameById[p.id as string] = p.name as string
    const heatmapData: Record<string, {
      free: number; maybe: number; total: number; ratio: number
      freeNames: string[]; maybeNames: string[]
    }> = {}
    for (const r of availRes.rows) {
      const key = `${r.date}|${r.hour}`
      if (!heatmapData[key]) heatmapData[key] = { free: 0, maybe: 0, total: 0, ratio: 0, freeNames: [], maybeNames: [] }
      const name = participantNameById[r.participant_id as string] || ''
      if (r.status === 'free') {
        heatmapData[key].free++
        if (name) heatmapData[key].freeNames.push(name)
      } else if (r.status === 'maybe') {
        heatmapData[key].maybe++
        if (name) heatmapData[key].maybeNames.push(name)
      }
    }
    for (const v of Object.values(heatmapData)) {
      v.total = v.free + v.maybe
      v.ratio = totalParticipants > 0 ? v.total / totalParticipants : 0
    }
    const heatmap = { heatmap: heatmapData, totalParticipants }

    return NextResponse.json({
      hang,
      participants,
      activities: actRes.rows,
      availability: availRes.rows,
      synthesis,
      comments: commentsRes.rows,
      transport: transportRes.rows,
      bringList,
      expenseData,
      rsvps: rsvpRes.rows,
      reactions: reactionsRes.rows,
      confirmVotes,
      polls,
      heatmap,
      commitment: {
        aggregate: commitmentAgg,
        byParticipant: commitmentByParticipant,
      },
    })
  } catch (e) {
    return serverError(e, 'GET /api/hangs/[id]/state')
  }
}
