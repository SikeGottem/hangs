// In-app notifications — written when server-side events happen (new hang,
// confirmed plan, response deadline approaching). Consumed by NotificationBell
// via GET /api/notifications.
//
// No email or push yet (Phase D). This is a deliberately minimal layer:
// one function to insert, one endpoint to read, one endpoint to mark read.

import { getDb, genId } from './db'

export type NotificationType =
  | 'hang_created'
  | 'hang_confirmed'
  | 'hang_cancelled'
  | 'response_needed'
  | 'crew_invite'

export type NotifyInput = {
  userId: string
  type: NotificationType
  text: string
  url?: string
  crewId?: string | null
  hangId?: string | null
}

export async function notify(input: NotifyInput): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: `INSERT INTO notifications (id, user_id, crew_id, hang_id, type, text, url)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      genId(12),
      input.userId,
      input.crewId ?? null,
      input.hangId ?? null,
      input.type,
      input.text,
      input.url ?? null,
    ],
  })
}

// Fan-out helper: notify every crew member except the actor.
export async function notifyCrewMembers(
  crewId: string,
  actorUserId: string | null,
  input: Omit<NotifyInput, 'userId' | 'crewId'>,
): Promise<void> {
  const db = getDb()
  const membersRes = await db.execute({
    sql: 'SELECT user_id FROM crew_members WHERE crew_id = ?',
    args: [crewId],
  })
  const rows = membersRes.rows
    .map(r => r.user_id as string)
    .filter(uid => uid !== actorUserId)

  if (!rows.length) return

  await db.batch(
    rows.map(uid => ({
      sql: `INSERT INTO notifications (id, user_id, crew_id, hang_id, type, text, url)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [genId(12), uid, crewId, input.hangId ?? null, input.type, input.text, input.url ?? null],
    })),
    'write',
  )
}
