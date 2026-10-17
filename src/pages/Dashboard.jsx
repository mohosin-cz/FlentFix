import { useState, useEffect, useCallback } from 'react'
import AppHeader from '../components/AppHeader'
import WorkQueue from '../components/home/WorkQueue'
import MyDesk, { useDesk } from '../components/home/MyDesk'
import TeamView, { useTeam } from '../components/home/TeamView'
import { useJourneyHome, greetingWord } from '../components/home/JourneyPanels'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Home: my desk on top, the work queue under it.
//
// The desk is tailored to whoever is signed in — their properties, what
// changed since they last looked, what is waiting on them. An admin can view
// anyone's desk. One journey-engine read feeds both halves, so the counts on
// the desk and the rows in the queue always agree.
const MONO = 'var(--font-mono, monospace)'
const firstName = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }

export default function Dashboard() {
  const { session } = useAuth()
  const me = (session?.user?.email || '').toLowerCase()
  const home = useJourneyHome('all')
  const [viewing, setViewing] = useState('')            // admin: someone else's desk
  const desk = useDesk(home.seen?.prev_seen_at, viewing || null, !home.loading)
  const [pick, setPick] = useState(null)
  const [team, setTeam] = useState([])
  const isAdmin = !!desk.data?.is_admin || !!viewing
  // admins open on the team; the choice is remembered on this device
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('pulse.home.tab') || 'team' } catch { return 'team' } })
  useEffect(() => { try { localStorage.setItem('pulse.home.tab', tab) } catch { /* private window */ } }, [tab])
  const showTeam = isAdmin && tab === 'team' && !viewing
  const teamData = useTeam(isAdmin && tab === 'team' && !home.loading)

  useEffect(() => {
    supabase.rpc('team_members').then(({ data }) => setTeam((data || []).filter(t => t.email.endsWith('@flent.in') && t.properties > 0)))
  }, [])

  const reloadAll = useCallback(() => { home.reload(); desk.reload(); if (showTeam) teamData.reload() }, [home, desk, teamData, showTeam])
  const who = viewing || me

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <AppHeader />
      <main style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px 14px', flexWrap: 'wrap', padding: '16px 20px 0' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
            {viewing ? `${firstName(viewing)}’s desk` : showTeam ? `${greetingWord()}, ${firstName(me)} — here’s the team` : `${greetingWord()}, ${firstName(me)}`}
          </h1>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          {isAdmin && (
            <span role="group" aria-label="Home view" style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
              {[['team', 'Team'], ['mine', 'My work']].map(([k, l]) => {
                const on = (k === 'team') === (tab === 'team' && !viewing)
                return <button key={k} type="button" aria-pressed={on} onClick={() => { setTab(k); setViewing('') }}
                  style={{ minHeight: 34, padding: '0 14px', border: 'none', background: on ? 'rgba(200,150,62,0.12)' : 'transparent', color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{l}</button>
              })}
            </span>
          )}
          {isAdmin && team.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>
              View desk of
              <select value={viewing} onChange={e => setViewing(e.target.value === me ? '' : e.target.value)}
                style={{ minHeight: 34, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12 }}>
                <option value="">Me</option>
                {team.filter(t => t.email !== me).map(t => <option key={t.email} value={t.email}>{firstName(t.email)} · {t.properties}</option>)}
              </select>
            </label>
          )}
        </div>
        {showTeam
          ? <TeamView home={home} team={teamData} onViewDesk={(email) => setViewing(email === me ? '' : email)} onPickView={(key) => setPick({ key, at: Date.now() })}
              queue={<WorkQueue key="team" home={home} pickView={pick} scope="team" title="Team’s open work" embedded />} />
          : <MyDesk key={who} home={home} desk={desk} viewing={viewing} onPickView={(key) => setPick({ key, at: Date.now() })} onChanged={reloadAll} />}
        {!showTeam && <WorkQueue key="mine" home={home} pickView={pick} scope="mine" title={viewing ? `${firstName(viewing)}’s queue` : 'Your queue'} />}
      </main>
    </div>
  )
}
