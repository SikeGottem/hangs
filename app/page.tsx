// Landing page for Hangs: the consumer-facing story, live planning demo, and returning-user launchpad.
"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { showToast } from "@/components/Toast"
import styles from "./home.module.css"

type HangSummary = {
  id: string
  name: string
  status: string
  participant_count: number
  created_at: number
  needsResponse: boolean
  isCreator: boolean
}

function mergeHangs(current: HangSummary[], incoming: HangSummary[]) {
  const byId = new Map(current.map((hang) => [hang.id, hang]))
  incoming.forEach((hang) => byId.set(hang.id, { ...byId.get(hang.id), ...hang }))
  return [...byId.values()].sort(
    (a, b) => Number(b.needsResponse) - Number(a.needsResponse) || b.created_at - a.created_at,
  )
}

const days = ["Tue", "Wed", "Thu", "Fri", "Sat"]
const times = ["5", "6", "7", "8", "9", "10"]
const heroSequence = ["1-2", "2-2", "2-3", "3-2", "3-3", "4-2"]
const initialAvailability = new Set([
  "0-1", "0-2", "1-1", "1-2", "1-3", "2-2", "2-3", "2-4", "3-2", "3-3", "4-1", "4-2",
])

function HangsMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? styles.markCompact : styles.mark} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function HeroAvailability() {
  const [filled, setFilled] = useState<Set<string>>(new Set(["0-2", "0-3", "1-3"]))

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    heroSequence.forEach((cell, index) => {
      timers.push(setTimeout(() => setFilled((current) => new Set(current).add(cell)), 500 + index * 260))
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className={styles.heroPlanner} aria-label="Example availability filling in across the week">
      <div className={styles.heroPlannerTopline}>
        <span>THIS WEEK</span>
        <span>3 FRIENDS IN</span>
      </div>
      <div className={styles.heroGrid}>
        {days.map((day, dayIndex) => (
          <div className={styles.heroDay} key={day}>
            <span>{day}</span>
            {Array.from({ length: 4 }, (_, row) => {
              const key = `${dayIndex}-${row}`
              return (
                <motion.i
                  key={key}
                  className={filled.has(key) ? styles.heroSlotActive : undefined}
                  animate={{ opacity: filled.has(key) ? 1 : 0.38, scale: filled.has(key) ? 1 : 0.96 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className={styles.heroDecision}>
        <span className={styles.decisionStamp}>BEST FIT</span>
        <strong>Thursday, 7pm</strong>
        <span>Everyone can make it</span>
      </div>
    </div>
  )
}

function AvailabilityPlanner() {
  const [selected, setSelected] = useState<Set<string>>(initialAvailability)
  const painting = useRef(false)
  const paintValue = useRef(true)

  useEffect(() => {
    const stopPainting = () => { painting.current = false }
    window.addEventListener("pointerup", stopPainting)
    window.addEventListener("pointercancel", stopPainting)
    return () => {
      window.removeEventListener("pointerup", stopPainting)
      window.removeEventListener("pointercancel", stopPainting)
    }
  }, [])

  const setCell = (key: string, value: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const startPainting = (key: string) => {
    const value = !selected.has(key)
    painting.current = true
    paintValue.current = value
    setCell(key, value)
    if ("vibrate" in navigator) navigator.vibrate(8)
  }

  return (
    <div className={styles.plannerShell}>
      <div className={styles.plannerHeader}>
        <div>
          <span className={styles.monoLabel}>FRIDAY DINNER</span>
          <strong>When are you free?</strong>
        </div>
        <span className={styles.savedState}>saved</span>
      </div>
      <p className={styles.dragHint}>Drag across the times that work for you.</p>
      <div className={styles.plannerGrid} role="grid" aria-label="Try painting your availability">
        <span />
        {days.map((day) => <span className={styles.dayHeader} key={day}>{day}</span>)}
        {times.map((time, row) => (
          <div className={styles.gridRow} key={time}>
            <span className={styles.timeLabel}>{time}pm</span>
            {days.map((day, column) => {
              const key = `${column}-${row}`
              const active = selected.has(key)
              return (
                <button
                  className={`${styles.gridCell} ${active ? styles.gridCellActive : ""}`}
                  key={day}
                  role="gridcell"
                  aria-selected={active}
                  aria-label={`${day} at ${time}pm, ${active ? "free" : "not selected"}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    startPainting(key)
                  }}
                  onPointerEnter={() => {
                    if (painting.current) setCell(key, paintValue.current)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault()
                      setCell(key, !active)
                    }
                  }}
                >
                  <span className={styles.visuallyHidden}>{active ? "Free" : "Unavailable"}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className={styles.plannerFooter} aria-live="polite">
        <span><b>{selected.size}</b> times marked</span>
        <span>Try dragging</span>
      </div>
    </div>
  )
}

function CommitmentDemo() {
  const [choice, setChoice] = useState("in")
  const options = [
    { id: "in", title: "I’m in", note: "Count on me" },
    { id: "probably", title: "Probably", note: "Keep me posted" },
    { id: "cant", title: "Can’t", note: "Sit this one out" },
  ]

  return (
    <div className={styles.commitmentControls} role="radiogroup" aria-label="Commitment level">
      {options.map((option) => (
        <button
          key={option.id}
          role="radio"
          aria-checked={choice === option.id}
          className={`${styles.commitmentOption} ${choice === option.id ? styles.commitmentSelected : ""}`}
          onClick={() => setChoice(option.id)}
        >
          <span className={styles.commitmentIndicator} />
          <span>
            <strong>{option.title}</strong>
            <small>{option.note}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function ReturningHangs({ hangs, onRepeat, repeatingId }: {
  hangs: HangSummary[]
  onRepeat: (id: string) => void
  repeatingId: string | null
}) {
  if (hangs.length === 0) return null

  return (
    <section className={styles.returningSection} aria-labelledby="your-hangs-heading">
      <div className={styles.returningHeader}>
        <h2 id="your-hangs-heading">Pick up where you left off.</h2>
        <Link href="/crews">Your crews</Link>
      </div>
      <div className={styles.hangList}>
        {hangs.slice(0, 4).map((hang) => (
          <article className={styles.hangRow} key={hang.id}>
            <Link href={hang.needsResponse ? `/h/${hang.id}` : `/h/${hang.id}/results`}>
              <span className={styles.hangStatus}>{hang.needsResponse ? "YOUR TURN" : hang.status.toUpperCase()}</span>
              <strong>{hang.name}</strong>
              <small>{hang.participant_count} {hang.participant_count === 1 ? "person" : "people"}</small>
            </Link>
            {hang.isCreator && (
              <button onClick={() => onRepeat(hang.id)} disabled={repeatingId === hang.id}>
                {repeatingId === hang.id ? "Repeating…" : "Repeat"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const router = useRouter()
  const [myHangs, setMyHangs] = useState<HangSummary[]>([])
  const [repeatingId, setRepeatingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/me/hangs")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.hangs)) return
        const serverHangs: HangSummary[] = data.hangs.map((hang: {
          id: string
          name: string
          status: string
          participantCount?: number
          createdAt?: number
          isCreator?: boolean
          participantId?: string
        }) => {
          if (hang.participantId) {
            localStorage.setItem(`hangs_participant_${hang.id}`, hang.participantId)
            if (hang.isCreator) localStorage.setItem(`hangs_${hang.id}`, hang.participantId)
          }
          return {
            id: hang.id,
            name: hang.name,
            status: hang.status,
            participant_count: hang.participantCount || 0,
            created_at: hang.createdAt || 0,
            needsResponse: false,
            isCreator: Boolean(hang.isCreator),
          }
        })
        setMyHangs((current) => mergeHangs(current, serverHangs))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const ids: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      const participant = key.match(/^hangs_participant_([a-zA-Z0-9]{6,})$/)
      const creator = key.match(/^hangs_([a-zA-Z0-9]{6,})$/)
      if (participant) ids.push(participant[1])
      else if (creator) ids.push(creator[1])
    }

    const unique = [...new Set(ids)]
    if (unique.length === 0) return

    Promise.all(unique.map(async (id) => {
      try {
        const response = await fetch(`/api/hangs/${id}`)
        if (!response.ok) return null
        const data = await response.json()
        const participantId = localStorage.getItem(`hangs_participant_${id}`) || localStorage.getItem(`hangs_${id}`)
        const participant = data.participants?.find((person: { id: string; hasResponded: boolean }) => person.id === participantId)
        return {
          id: data.hang.id,
          name: data.hang.name,
          status: data.hang.status,
          participant_count: data.participants?.length || 0,
          created_at: data.hang.created_at,
          needsResponse: participant ? !participant.hasResponded : true,
          isCreator: Boolean(localStorage.getItem(`hangs_${id}`)),
        } satisfies HangSummary
      } catch {
        return null
      }
    })).then((results) => {
      const valid = results.filter((hang): hang is HangSummary => Boolean(hang))
      setMyHangs((current) => mergeHangs(current, valid))
    })
  }, [])

  const repeatHang = async (hangId: string) => {
    setRepeatingId(hangId)
    try {
      const response = await fetch(`/api/hangs/${hangId}/clone`, { method: "POST" })
      if (!response.ok) throw new Error("Clone failed")
      const data = await response.json()
      if (data.id && data.creatorId) {
        localStorage.setItem(`hangs_${data.id}`, data.creatorId)
        localStorage.setItem(`hangs_participant_${data.id}`, data.creatorId)
      }
      if (data.creatorToken) localStorage.setItem(`hangs_token_${data.id}`, data.creatorToken)
      router.push(`/h/${data.id}/results?justCreated=1`)
    } catch {
      showToast("Couldn’t repeat that hang. Try again.", "error")
      setRepeatingId(null)
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>PLANS FOR PEOPLE WITH FRIENDS</span>
          <h1 id="hero-heading">Make plans.<br /><span>Actually make them.</span></h1>
          <p>Find the time, pick the thing, and get an honest headcount. No signup.</p>
          <div className={styles.heroActions}>
            <Link className="btn-primary" href="/create">Plan a hang</Link>
            <a className={styles.textAction} href="#how-it-works">See how it works</a>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroPhotoFrame}>
            <Image
              src="/hangs/hero-friends.webp"
              alt="Friends deciding what to do together around an outdoor table"
              fill
              priority
              sizes="(max-width: 767px) 100vw, 52vw"
            />
          </div>
          <HeroAvailability />
        </div>
      </section>

      <section className={styles.promiseStrip} aria-label="Hangs product promise">
        <span>ONE LINK</span>
        <HangsMark compact />
        <span>NO ACCOUNTS</span>
        <HangsMark compact />
        <span>ONE ACTUAL PLAN</span>
      </section>

      <section className={styles.availabilitySection} id="how-it-works" aria-labelledby="availability-heading">
        <div className={styles.availabilityCopy}>
          <span className={styles.sectionIndex}>The hard part, made easy.</span>
          <h2 id="availability-heading">Everyone paints in when they’re free.</h2>
          <p>No calendar admin. No thirty-message chain. Drag once and you’re done.</p>
          <div className={styles.peopleLine} aria-label="Example participants">
            <span className={styles.avatar}>EK</span>
            <span className={styles.avatar}>MA</span>
            <span className={styles.avatar}>JS</span>
            <span>3 people have answered</span>
          </div>
        </div>
        <AvailabilityPlanner />
      </section>

      <section className={styles.activitySection} aria-labelledby="activity-heading">
        <div className={styles.activityHeading}>
          <h2 id="activity-heading">Then pick the thing.</h2>
          <p>Vote on real options while everyone is already there.</p>
        </div>
        <div className={styles.activityGallery}>
          <figure className={styles.bowlingFigure}>
            <Image src="/hangs/bowling-night.webp" alt="Friends bowling together at night" fill sizes="(max-width: 767px) 100vw, 44vw" />
          </figure>
          <div className={styles.votePanel}>
            <span className={styles.votePrompt}>WHAT ARE WE FEELING?</span>
            <button className={styles.voteRow}>
              <span>Bowling</span><strong>4 keen</strong>
            </button>
            <button className={styles.voteRow}>
              <span>Late dinner</span><strong>3 keen</strong>
            </button>
            <button className={styles.voteRow}>
              <span>Karaoke</span><strong>2 keen</strong>
            </button>
          </div>
          <figure className={styles.picnicFigure}>
            <Image src="/hangs/picnic-night.webp" alt="Friends sharing takeaway food beside the water" fill sizes="(max-width: 767px) 100vw, 32vw" />
          </figure>
        </div>
      </section>

      <section className={styles.commitmentSection} aria-labelledby="commitment-heading">
        <div className={styles.commitmentCopy}>
          <HangsMark />
          <h2 id="commitment-heading">“Yeah maybe” isn’t a headcount.</h2>
          <p>Hangs asks the useful question before anyone books the table.</p>
          <div className={styles.headcountLine}>
            <strong>4 in</strong><span>2 probably</span><span>1 can’t</span>
          </div>
        </div>
        <CommitmentDemo />
      </section>

      <section className={styles.flowSection} aria-labelledby="flow-heading">
        <h2 id="flow-heading">From “we should” to “see you there.”</h2>
        <div className={styles.flowSteps}>
          <div><span>1</span><strong>Start it</strong><p>Name the hang and share one link.</p></div>
          <div><span>2</span><strong>Answer it</strong><p>Friends mark times, vote, and commit.</p></div>
          <div><span>3</span><strong>Lock it</strong><p>Hangs finds the strongest plan.</p></div>
        </div>
      </section>

      <ReturningHangs hangs={myHangs} onRepeat={repeatHang} repeatingId={repeatingId} />

      <section className={styles.finalCta} aria-labelledby="cta-heading">
        <div>
          <span>THE GROUP CHAT CAN REST</span>
          <h2 id="cta-heading">Make this one happen.</h2>
        </div>
        <Link className="btn-primary" href="/create">Plan a hang</Link>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerBrand} href="/"><HangsMark compact /> hangs</Link>
        <p>Made for plans outside the calendar.</p>
        <nav aria-label="Footer">
          <Link href="/login">Log in</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>

      <AnimatePresence initial={false} />
    </div>
  )
}
