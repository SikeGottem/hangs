// Minimal fire-and-forget analytics writer. No dashboard yet — we just want
// rows we can query later ("how many crew members responded this week?").
// Deliberately non-throwing: an analytics failure must never break a user-facing
// request.

import { getDb } from './db'

export type AnalyticsEvent =
  | 'auth_login'
  | 'crew_created'
  | 'member_invited'
  | 'member_joined'
  | 'profile_completed'
  | 'hang_created'
  | 'hang_responded'
  | 'hang_confirmed'
  | 'hang_cloned'
  | 'notification_clicked'

export type EventContext = {
  userId?: string | null
  crewId?: string | null
  hangId?: string | null
  metadata?: Record<string, unknown>
}

export function logEvent(event: AnalyticsEvent, ctx: EventContext = {}): void {
  // Don't await — we don't want analytics on the critical path
  ;(async () => {
    try {
      const db = getDb()
      await db.execute({
        sql: `INSERT INTO analytics_events (user_id, crew_id, hang_id, event, metadata_json)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          ctx.userId ?? null,
          ctx.crewId ?? null,
          ctx.hangId ?? null,
          event,
          ctx.metadata ? JSON.stringify(ctx.metadata) : null,
        ],
      })
    } catch (e) {
      console.warn('[analytics] log failed:', e)
    }
  })()
}
