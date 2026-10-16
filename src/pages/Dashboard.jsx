import AppHeader from '../components/AppHeader'
import WorkQueue from '../components/home/WorkQueue'

// Home is the work queue and nothing else.
//
// The panels that used to live here — active properties, snapshot, quick
// actions, the activity feed — were never used. A CRM's home is a list of the
// unit of work under saved views with counts; for Pulse that unit is the
// property and the views come from the journey engine. Quick actions live in
// the ⌘K palette; the stats, where they are needed, live on their own pages.
export default function Dashboard() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <AppHeader />
      <main style={{ flex: 1 }}>
        <WorkQueue />
      </main>
    </div>
  )
}
