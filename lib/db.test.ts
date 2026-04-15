// Smoke test for the pure synthesis function. This is the one piece of code
// whose correctness directly shapes the "best time" recommendation — worth
// locking in before it evolves further.
import { describe, it, expect } from 'vitest'
import { synthesiseFromData } from './db'

const sampleActivities = [
  { id: 1, name: 'Dinner', ups: 3, downs: 0 },
  { id: 2, name: 'Bowling', ups: 1, downs: 2 },
]

describe('synthesiseFromData', () => {
  it('returns null with no participants', () => {
    expect(synthesiseFromData([], [], [])).toBeNull()
  })

  it('picks the slot where the most participants are free', () => {
    const participants = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
    ]
    const avail = [
      { participant_id: 'p1', date: '2026-04-20', hour: 14, status: 'free' },
      { participant_id: 'p2', date: '2026-04-20', hour: 14, status: 'free' },
      { participant_id: 'p3', date: '2026-04-20', hour: 14, status: 'free' },
      { participant_id: 'p1', date: '2026-04-21', hour: 14, status: 'free' },
      { participant_id: 'p2', date: '2026-04-21', hour: 14, status: 'maybe' },
    ]
    const result = synthesiseFromData(participants, avail, sampleActivities)
    expect(result).not.toBeNull()
    expect(result!.recommendedTime.date).toBe('2026-04-20')
    expect(result!.recommendedTime.hour).toBe(14)
    expect(result!.recommendedTime.freeCount).toBe(3)
  })

  it('weights maybe at 0.5 vs free at 1.0', () => {
    const participants = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]
    const avail = [
      // Slot A: 1 free, 0 maybe → score 1.0 (default weight 0.75 for unknown commitment)
      { participant_id: 'p1', date: '2026-04-20', hour: 10, status: 'free' },
      // Slot B: 0 free, 2 maybe → score 0.5 * 2 = 1.0 (same weighted)
      { participant_id: 'p1', date: '2026-04-20', hour: 11, status: 'maybe' },
      { participant_id: 'p2', date: '2026-04-20', hour: 11, status: 'maybe' },
    ]
    const result = synthesiseFromData(participants, avail, sampleActivities)
    // Both slots score equally — free tiebreaker wins → slot A
    expect(result!.recommendedTime.hour).toBe(10)
  })

  it('commitment weighting: fewer "in" people beat more "probably" people', () => {
    const participants = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dan' },
    ]
    const avail = [
      // Slot A: 2 "in" people → weighted 2.0
      { participant_id: 'p1', date: '2026-04-20', hour: 14, status: 'free' },
      { participant_id: 'p2', date: '2026-04-20', hour: 14, status: 'free' },
      // Slot B: 3 "probably" people → weighted 1.5
      { participant_id: 'p3', date: '2026-04-21', hour: 14, status: 'free' },
      { participant_id: 'p4', date: '2026-04-21', hour: 14, status: 'free' },
      // One "probably" person shared for raw-count parity — but same weighted score
    ]
    const withCommit = synthesiseFromData(participants, avail, sampleActivities, [
      { participant_id: 'p1', level: 'in' },
      { participant_id: 'p2', level: 'in' },
      { participant_id: 'p3', level: 'probably' },
      { participant_id: 'p4', level: 'probably' },
    ])
    // Slot A weighted = 2.0, Slot B weighted = 1.0. A wins.
    expect(withCommit!.recommendedTime.date).toBe('2026-04-20')
  })

  it('confidence reflects responded / total', () => {
    const participants = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dan' },
      { id: 'p5', name: 'Eve' },
    ]
    // Only 1 of 5 responded — low confidence
    const avail = [
      { participant_id: 'p1', date: '2026-04-20', hour: 14, status: 'free' },
    ]
    const result = synthesiseFromData(participants, avail, sampleActivities)
    expect(result!.confidence).toBe('low')
    expect(result!.respondedCount).toBe(1)
    expect(result!.totalParticipants).toBe(5)
  })

  it('recommendedActivity comes from the highest net ups activity', () => {
    const participants = [{ id: 'p1', name: 'Alice' }]
    const avail = [{ participant_id: 'p1', date: '2026-04-20', hour: 14, status: 'free' }]
    const result = synthesiseFromData(participants, avail, sampleActivities)
    expect(result!.recommendedActivity?.name).toBe('Dinner')
    expect(result!.recommendedActivity?.ups).toBe(3)
  })
})
