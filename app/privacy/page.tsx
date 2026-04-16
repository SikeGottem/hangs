// Privacy policy page. Required for the Google OAuth consent screen and
// generally good to have. Kept deliberately short and honest.
export const metadata = {
  title: 'Privacy — hangs',
  description: 'What hangs stores, what it doesn\'t, and how Google Calendar sync works.',
}

export default function PrivacyPage() {
  return (
    <div style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '32px 24px 80px',
      fontFamily: 'var(--font-body)',
      color: 'var(--text-primary)',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        marginBottom: 8,
      }}>
        Privacy
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
        hangs is a side project. This page is short on purpose.
      </p>

      <Section title="What hangs stores">
        <ul>
          <li>The hang name, dates, activities, location, and bring list you enter when you create a hang.</li>
          <li>Your first name (or whatever you type) when you respond to a hang.</li>
          <li>Your availability grid and your votes, tied to an anonymous participant ID.</li>
          <li>A signed JWT in your browser so your responses can't be edited by someone else.</li>
          <li>Photos you upload to a hang recap (EXIF metadata is stripped before upload).</li>
        </ul>
      </Section>

      <Section title="What hangs doesn't store">
        <ul>
          <li>Your email address or phone number — there's no signup.</li>
          <li>Your precise location. The optional "location" field on a hang is just text.</li>
          <li>Any tracking cookies or third-party analytics.</li>
          <li>Any of your Google Calendar event details (see below).</li>
        </ul>
      </Section>

      <Section title="Google Calendar sync">
        <p>
          If you use the optional "Sync Google Calendar" button on the availability
          step, hangs asks Google for the <code>calendar.freebusy</code> scope
          only — the narrowest Calendar scope Google offers. This returns just
          the start and end times of events you're busy for. It never returns
          titles, locations, attendees, or any other event detail.
        </p>
        <p>
          The access token Google issues lives in your browser for a few
          minutes and is used exactly once to call Google's{' '}
          <code>freebusy.query</code> API directly from your browser. The token
          is never sent to the hangs backend, never saved to cookies or
          localStorage, and expires automatically. hangs never stores any
          information about your calendar — only the "busy/free" cells you see
          painted on the grid after the sync, which are treated the same as
          if you'd painted them yourself.
        </p>
      </Section>

      <Section title="Deletion">
        <p>
          Any hang creator can delete their hang from the results page, which
          cascades and deletes every participant's availability, votes, and
          comments for that hang.
        </p>
        <p>
          Any participant can remove themselves from a hang via the "Remove me
          from this hang" button. Their availability, votes, and comments are
          deleted immediately.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Built by Ethan Wu. Questions? Email{' '}
          <a href="mailto:ethanswu@gmail.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>
            ethanswu@gmail.com
          </a>
          .
        </p>
      </Section>

      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 40 }}>
        Last updated 2026-04-16
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        marginBottom: 10,
      }}>
        {title}
      </h2>
      <div style={{
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
      }}>
        {children}
      </div>
    </section>
  )
}
