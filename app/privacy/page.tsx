// Editorial privacy policy for Hangs, including the Google Calendar data boundary.

import styles from '@/app/product.module.css'

export const metadata = {
  title: 'Privacy — hangs',
  description: 'What hangs stores, what it doesn\'t, and how Google Calendar sync works.',
}

export default function PrivacyPage() {
  return (
    <article className={styles.page}>
      <header className={styles.policyHeader}>
        <span className={styles.eyebrow}>The short version, in full</span>
        <h1 className={styles.titleLarge}>Privacy</h1>
        <p className={styles.lede}>hangs is a side project. This page is short on purpose.</p>
      </header>

      <PolicySection title="What hangs stores">
        <ul>
          <li>The hang name, dates, activities, location, and bring list you enter when you create a hang.</li>
          <li>Your first name (or whatever you type) when you respond to a hang.</li>
          <li>Your availability grid and your votes, tied to an anonymous participant ID.</li>
          <li>A signed JWT in your browser so your responses can&apos;t be edited by someone else.</li>
          <li>Photos you upload to a hang recap (EXIF metadata is stripped before upload).</li>
        </ul>
      </PolicySection>
      <PolicySection title="What hangs doesn&apos;t store">
        <ul>
          <li>Your email address or phone number — there&apos;s no signup.</li>
          <li>Your precise location. The optional &quot;location&quot; field on a hang is just text.</li>
          <li>Any tracking cookies or third-party analytics.</li>
          <li>Any of your Google Calendar event details (see below).</li>
        </ul>
      </PolicySection>
      <PolicySection title="Google Calendar sync">
        <p>If you use the optional &quot;Sync Google Calendar&quot; button on the availability step, hangs asks Google for the <code>calendar.freebusy</code> scope only — the narrowest Calendar scope Google offers. This returns just the start and end times of events you&apos;re busy for. It never returns titles, locations, attendees, or any other event detail.</p>
        <p>The access token Google issues lives in your browser for a few minutes and is used exactly once to call Google&apos;s <code>freebusy.query</code> API directly from your browser. The token is never sent to the hangs backend, never saved to cookies or localStorage, and expires automatically. hangs never stores any information about your calendar — only the &quot;busy/free&quot; cells you see painted on the grid after the sync, which are treated the same as if you&apos;d painted them yourself.</p>
      </PolicySection>
      <PolicySection title="Deletion">
        <p>Any hang creator can delete their hang from the results page, which cascades and deletes every participant&apos;s availability, votes, and comments for that hang.</p>
        <p>Any participant can remove themselves from a hang via the &quot;Remove me from this hang&quot; button. Their availability, votes, and comments are deleted immediately.</p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>Built by Ethan Wu. Questions? Email <a href="mailto:ethanswu@gmail.com">ethanswu@gmail.com</a>.</p>
      </PolicySection>
      <p className={styles.meta} style={{ marginTop: '2rem' }}>LAST UPDATED 2026-04-16</p>
    </article>
  )
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.policyGrid}><h2>{title}</h2><div className={styles.policyBody}>{children}</div></section>
}
