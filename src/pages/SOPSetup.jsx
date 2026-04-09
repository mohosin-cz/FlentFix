import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Primitives ────────────────────────────────────────────────────────────────

function Para({ children, style }) {
  return (
    <p style={{
      margin: '6px 0', fontSize: 13, lineHeight: 1.75,
      color: 'var(--text, #e8e8f0)',
      fontFamily: 'var(--font-sans, Poppins, sans-serif)',
      ...style,
    }}>
      {children}
    </p>
  )
}

function Ul({ items }) {
  return (
    <ul style={{ margin: '8px 0', paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          marginBottom: 5, fontSize: 13, lineHeight: 1.65,
          color: 'var(--text, #e8e8f0)',
          fontFamily: 'var(--font-sans, Poppins, sans-serif)',
        }}>
          {item}
        </li>
      ))}
    </ul>
  )
}

function Ol({ items }) {
  return (
    <ol style={{ margin: '8px 0', paddingLeft: 22 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          marginBottom: 5, fontSize: 13, lineHeight: 1.65,
          color: 'var(--text, #e8e8f0)',
          fontFamily: 'var(--font-sans, Poppins, sans-serif)',
        }}>
          {item}
        </li>
      ))}
    </ol>
  )
}

function Callout({ children, type = 'amber' }) {
  const cfg = {
    amber: { bg: 'rgba(200,150,62,0.08)',  border: 'var(--accent, #c8963e)' },
    green: { bg: 'rgba(61,186,122,0.08)',  border: 'var(--green, #3dba7a)' },
    red:   { bg: 'rgba(224,92,106,0.08)',  border: 'var(--red, #e05c6a)' },
  }
  const c = cfg[type] || cfg.amber
  return (
    <div style={{
      background: c.bg,
      borderLeft: `3px solid ${c.border}`,
      padding: '11px 16px',
      margin: '12px 0',
      borderRadius: '0 6px 6px 0',
      fontSize: 13,
      color: 'var(--text, #e8e8f0)',
      lineHeight: 1.65,
      fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    }}>
      {children}
    </div>
  )
}

function CodeBlock({ children }) {
  return (
    <pre style={{
      background: 'var(--bg-input, #252731)',
      border: '1px solid var(--border, #2e3040)',
      borderRadius: 6,
      padding: '14px 18px',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 12,
      lineHeight: 1.75,
      overflowX: 'auto',
      margin: '12px 0',
      color: 'var(--text, #e8e8f0)',
      whiteSpace: 'pre-wrap',
    }}>
      {children}
    </pre>
  )
}

function SopTable({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', margin: '12px 0', borderRadius: 8, border: '1px solid var(--border, #2e3040)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
        <thead>
          <tr style={{ background: '#0d0d0d' }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 14px',
                textAlign: 'left',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent, #c8963e)',
                borderBottom: '1px solid var(--border, #2e3040)',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '10px 14px',
                  borderBottom: ri < rows.length - 1 ? '1px solid var(--border, #2e3040)' : 'none',
                  verticalAlign: 'top',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--text, #e8e8f0)',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--accent, #c8963e)',
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        borderBottom: '1px solid var(--border, #2e3040)',
        paddingBottom: 6,
        marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── Accordion section ─────────────────────────────────────────────────────────

function Section({ num, title, open, onToggle, children }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border, #2e3040)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '15px 24px',
          background: 'var(--bg-panel, #1e2028)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: 12,
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            color: 'var(--accent, #c8963e)',
            minWidth: 20,
          }}>
            §{num}
          </span>
          <span style={{
            fontFamily: 'var(--font-sans, Poppins, sans-serif)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text, #e8e8f0)',
            letterSpacing: '-0.1px',
          }}>
            {title}
          </span>
        </div>
        <span style={{
          color: open ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          flexShrink: 0,
        }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{
          padding: '22px 24px 26px',
          background: 'var(--bg, #16171f)',
          borderTop: '1px solid var(--border, #2e3040)',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SOPSetup() {
  const navigate = useNavigate()
  const [open, setOpen] = useState({})
  const toggle = n => setOpen(p => ({ ...p, [n]: !p[n] }))

  return (
    <div style={s.page}>

      {/* Dark page header */}
      <div style={s.pageHeader}>
        <button onClick={() => navigate('/sops')} style={s.back}>← SOPs</button>
        <div style={s.docBadge}>SOP · PROPERTY SETUP</div>
        <h1 style={s.docTitle}>Flent — Setup SOP</h1>
        <div style={s.metaRow}>
          <span style={s.metaItem}>Owner: Product Operations</span>
          <span style={s.metaSep}>·</span>
          <span style={s.metaItem}>Version: 2.0</span>
          <span style={s.metaSep}>·</span>
          <span style={s.metaItem}>Last Updated: March 2026</span>
          <span style={s.metaSep}>·</span>
          <span style={s.statusBadge}>Active</span>
        </div>
      </div>

      {/* Accordion document */}
      <div style={s.doc}>

        {/* §1 Purpose */}
        <Section num={1} title="Purpose" open={!!open[1]} onToggle={() => toggle(1)}>
          <Para>This document is the operating manual for every Flent setup day. It covers the full flow from 9:15 AM to 6:00 PM — who does what, in what order, and how decisions get made when things don't go to plan.</Para>
          <Para>Every associate and vendor on site is expected to be familiar with their section before the day begins. The reference property throughout this document is a 3BHK. The flow scales to any property size — the sequence never changes, only the number of repetitions does.</Para>
        </Section>

        {/* §2 The Standard + Non-Negotiables */}
        <Section num={2} title="The Standard + Non-Negotiables" open={!!open[2]} onToggle={() => toggle(2)}>
          <Callout type="green">
            <strong>Every fitting, fixture, and appliance in the property must work without fail for a minimum of six months. That applies to every trade, every room, without exception.</strong>
          </Callout>
          <Para>A property is move-in ready when:</Para>
          <Ul items={[
            'Every room is complete — bed made, storage usable, nothing sitting on the floor',
            'Every appliance is working — fridge cold, washing machine tested, geyser hot',
            'Every utility is live — WiFi connected, RO running, gas on',
            'Every fixture is solid — no wobble, no drip, no flicker',
            'The property is clean — not surface clean, properly clean',
            'Nothing that was promised is missing',
          ]} />
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Non-Negotiables</div>
            <Para>These apply to every setup day, every property, without exception.</Para>
            <Ol items={[
              'No room is signed off until Ops completes QC',
              'Once a room is closed, no one re-enters',
              'Design scope takes priority on setup day — fixture work is pre-scheduled at T-1 or T-2 where possible',
              'All material gaps must be raised before 10:00 AM so the runner can procure',
              'Everyone is off-site by 6:00 PM',
            ]} />
          </div>
        </Section>

        {/* §3 The Team */}
        <Section num={3} title="The Team" open={!!open[3]} onToggle={() => toggle(3)}>
          <SopTable
            headers={['Role', 'Count', 'Reports To', 'Scope']}
            rows={[
              ['Product Ops Associate', '1', 'Manager', 'Flow · Execution · QC'],
              ['Design Ops Associate', '1', 'Manager', 'Look · Feel · Staging'],
              ['Carpenter 1', '1', 'Product Ops', 'BRs → Living Room'],
              ['Carpenter 2', '1', 'Product Ops', 'BRs → Kitchen'],
              ['Electrician 1', '1', 'Product Ops', 'BRs → Living Room'],
              ['Electrician 2', '1', 'Product Ops', 'BRs → Kitchen'],
              ['Plumber', '1', 'Product Ops', 'All rooms sequentially'],
              ['Cleaner 1', '1', 'Product Ops', 'Bedroom cleaning'],
              ['Cleaner 2', '1', 'Product Ops', 'Bathroom cleaning'],
              ['Runner', '1', 'Product Ops (primary) · Design Ops (secondary)', 'Logistics · Staging · Utilities'],
            ]}
          />
          <Callout>
            <strong>Ownership:</strong> Product Ops owns the day — the timeline, the flow, every sign-off. Design Ops owns the output — what the home looks and feels like when it's done. Both associates share the same vendor team, which is where coordination is most critical.
          </Callout>
          <Para>When both associates need the same vendor at the same time, Product Ops decides priority. When the two associates disagree on a call, both escalate to their respective managers immediately — not at the end of the day.</Para>
        </Section>

        {/* §4 The Day Blueprint */}
        <Section num={4} title="The Day Blueprint" open={!!open[4]} onToggle={() => toggle(4)}>
          <SopTable
            headers={['Time', 'Block', 'Who Is Active']}
            rows={[
              ['9:15 AM', 'Hard cutoff — everyone on site', 'Full team'],
              ['9:15–9:30 AM', 'Briefing and Breakfast', 'Full team'],
              ['9:30 AM–1:00 PM', 'Sets — bedrooms in sequence', 'Vendors · Ops · Design'],
              ['1:00–3:00 PM', 'Lunch — staggered, half the team always working', 'Half team'],
              ['3:00–5:00 PM', 'Common spaces — Living Room · Kitchen · Balcony', 'Full team'],
              ['5:00–6:00 PM', 'Finishing · QC · Walkthrough', 'Ops + Design'],
              ['6:00 PM', 'Hard stop — everyone off-site', '—'],
            ]}
          />
        </Section>

        {/* §5 Block by Block */}
        <Section num={5} title="Block by Block" open={!!open[5]} onToggle={() => toggle(5)}>

          <SubSection title="The Night Before">
            <Para>The evening before setup day, the Ops Associate completes the following:</Para>
            <Ul items={[
              'Confirm all furniture, T-Day boxes, and delivery items are at the property',
              'Check with warehouse and logistics that nothing is outstanding',
              'Review society and building rules from the Slack property onboarding form',
              'Confirm any landlord-specific instructions with the supply team',
              'Send vendor alignment on the WhatsApp group — property address, flat number, who is coming, and what time',
              'Confirm WiFi technician and RO installation are scheduled',
            ]} />
            <Para style={{ fontStyle: 'italic', color: 'var(--text-muted, #6b6d82)' }}>A setup day that starts well almost always ends well. The night before is where that starts.</Para>
          </SubSection>

          <SubSection title="Briefing and Breakfast — 9:15 to 9:30 AM">
            <Para>Everyone is on site by 9:15 AM. Breakfast and briefing happen simultaneously.</Para>
            <Para><strong>The briefing covers:</strong></Para>
            <Ul items={[
              'The flow specific to this property — layout, known issues, anything to watch for',
              'Room assignments — who starts where, with no ambiguity',
              'Priority tasks for the day',
              'Society rules — silent hours, goods lift access, drilling restrictions',
              'Material check — any gaps are flagged here so the runner can go out before 10:00 AM',
            ]} />
            <Para><strong>Before the briefing closes, Ops confirms:</strong></Para>
            <Ul items={[
              'Every vendor is present — a missing vendor is resolved now, not at 11:00 AM',
              'Sticky note labels are on every door — BR1, BR2, BR3, Kitchen, Living Room, Balcony',
              'All landlord materials are identified, photographed, and moved to a designated holding area',
              'T-Day boxes are positioned and accessible',
            ]} />
            <Callout>If a critical item is missing when the briefing ends — stop. Resolve it before work begins.</Callout>
          </SubSection>

          <SubSection title="Sets — 9:30 AM to 1:00 PM">
            <Para>A set is one bedroom and its attached bathroom, treated as a single unit. The set is not complete until both are done. Every set follows the same sequence — no shortcuts, no reordering.</Para>
            <Para><strong>Set Sequence</strong></Para>
            <CodeBlock>{`Carpenter 1 + Electrician 1 + Plumber → enter the room

Vendors complete their scope

Vendors get sign-off from Designer and Ops before exiting

Vendors exit

Cleaner 1 → bedroom cleaning
Cleaner 2 → bathroom cleaning

Cleaners exit

Runner enters and stages the room
[ curtains · bedsheet · mattress · pillow case · rugs · bathroom accessories · appliance check ]

Designer enters — final touches and décor

Ops walks the room and signs off

Room is closed. No re-entry.`}</CodeBlock>
            <Para><strong>Parallel Work</strong></Para>
            <Ul items={[
              'Carpenter 2 and Electrician 2 run the next BR in parallel',
              'The Plumber works sequentially — BR1, BR2, BR3',
              'Cleaners follow vendors out of each set and move together',
              'Runner follows cleaners and stages each room as it clears',
              'Designer follows the runner and closes each room aesthetically',
              'Ops closes each room formally with a sign-off',
            ]} />
            <Para><strong>Kitchen During the Sets Block</strong></Para>
            <Para>While vendors are in BR1, Cleaner 1 begins kitchen cleaning at 9:30 AM. Kitchen pest control is completed before setup day, so cleaning can start immediately without waiting.</Para>
            <Para><strong>Common Bathroom and Balcony</strong></Para>
            <Para>The common bathroom is part of the BR3 set. Whoever closes BR3 closes the common bathroom as part of the same set.</Para>
            <Para>Balcony ownership follows the adjacent space. If it opens from a bedroom, that bedroom's team handles it. If it opens from the living room, the living room team handles it.</Para>
            <Para style={{ marginTop: 12 }}><strong>Set Order</strong></Para>
            <Para>BR1 → BR2 → BR3 and common bathroom → Living Room → Kitchen and Utility</Para>
            <Para style={{ marginTop: 16 }}><strong>Scaling by Property Size</strong></Para>
            <SopTable
              headers={['Property Type', 'Sets', 'Common Areas']}
              rows={[
                ['1BHK', '1 BR + bathroom', 'Living Room + Kitchen'],
                ['2BHK', '2 BRs + bathrooms', 'Living Room + Kitchen'],
                ['3BHK', '3 BRs + bathrooms + common bathroom', 'Living Room + Kitchen + Balcony'],
                ['4BHK+', '4–5 BRs + bathrooms', 'Extended common areas — plan T-1 pre-work'],
                ['Duplex / Independent', 'Floor by floor, same sequence per floor', 'Common spaces at end of each floor'],
              ]}
            />
          </SubSection>

          <SubSection title="Common Spaces — 3:00 PM to 5:00 PM">
            <Para>Once all BRs are closed, the full team moves to shared areas simultaneously.</Para>
            <SopTable
              headers={['Space', 'Who', 'Focus']}
              rows={[
                ['Living Room', 'Carpenter 1 · Electrician 1 · Runner · Designer', 'Furniture · lights · staging · décor'],
                ['Kitchen', 'Carpenter 2 · Electrician 2 · Plumber · Runner', 'Sink · appliances · RO · gas · utensils'],
                ['Common Bathrooms', 'Plumber · Cleaner 1 · Cleaner 2', 'Fittings · geyser · exhaust · full clean'],
                ['Balcony', 'Runner · Cleaner', 'Furniture · plants · sweep'],
              ]}
            />
            <Para>Ops tracks all spaces simultaneously. This block is not closed until every space within it is complete.</Para>
          </SubSection>

          <SubSection title="Finishing and QC — 5:00 PM to 6:00 PM">
            <Para>Ops walks every room and checks the following:</Para>
            <Ul items={[
              'Electrical: Every switch works · Every socket is live · Every light is on · Every fan runs on all speeds without wobble',
              'Plumbing: Every tap runs clean · Every geyser is hot · Every flush works fully · No leaks anywhere',
              'Carpentry: Every door opens, closes, and locks · Every drawer runs smooth · Every hinge is silent · Every shelf is level and stable · Every wall fitting is drilled in — nothing held with tape',
              'Appliances: Fridge cold · Washing machine cycle completed · Microwave tested · All appliances confirmed working',
              "Utilities: WiFi live and tested on two devices, credentials logged · RO dispensing · Gas connected and tested",
              'Cleaning: Floors mopped · Glass and mirrors wiped · Bathrooms sanitised · Kitchen surfaces clean and dry · No packaging, tools, or waste remaining anywhere in the property',
              "Staging: Every room complete · Nothing on the floor that shouldn't be there · All décor placed",
            ]} />
            <Para style={{ marginTop: 14 }}><strong>Snag List</strong></Para>
            <Para>Any issue found during QC is logged immediately:</Para>
            <Ul items={[
              'Can be resolved before 6:00 PM → assign and fix it',
              'Cannot be resolved today → log as spillover with a resolution plan and committed date',
              'Was not in the inspection → log as an inspection lapse and flag to the manager',
            ]} />
            <Para style={{ marginTop: 14 }}><strong>Final Walkthrough</strong></Para>
            <Para>Ops and Designer walk every room together. The question is simple — does this feel like a home someone can move into tonight? If yes, it's done. If no, something still needs attention.</Para>
            <Callout>Everyone off-site by 6:00 PM.</Callout>
          </SubSection>

        </Section>

        {/* §6 Role KRAs */}
        <Section num={6} title="Role KRAs" open={!!open[6]} onToggle={() => toggle(6)}>

          <SubSection title="Product Ops Associate">
            <Ul items={[
              'Pre-setup check the night before',
              'Leads the morning briefing',
              'Manages vendor assignments and movement throughout the day',
              'Pre-approves every onsite purchase before the runner procures',
              'Collects all invoices and handles payment',
              'Categorises every material purchased — OpEx-Fix, OpEx-Invtr, or CapEx-Invtr',
              'Manages the snag list in real time',
              'Signs off on each room and the full property at end of day',
              'First point of escalation for all vendor issues on site',
              'Logs all spillover before leaving the property',
            ]} />
          </SubSection>

          <SubSection title="Design Ops Associate">
            <Ul items={[
              'Marks placements for every room before work begins',
              'Stays close to vendor work in each room to guide decisions in real time',
              'Confirms vendor work before they exit any room',
              'Stages each room alongside the runner',
              'Final aesthetic sign-off on every room before Ops QC',
              'Flags any design-critical issue to Ops the moment it comes up — not during the final walkthrough',
              'Escalates inter-associate conflicts to their manager immediately',
            ]} />
          </SubSection>

          <SubSection title="Runner">
            <Para><strong>Inventory and Materials</strong></Para>
            <Ul items={[
              'Receives, verifies, and organises all deliveries before the day starts. Cross-checks against the delivery list and flags any gaps to Ops immediately.',
              'Procures missing materials during the day — always informs Ops before leaving and confirms a return time.',
              'Tracks every item taken out of the T-Day boxes.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>T-Day Boxes</strong></Para>
            <Ul items={[
              'Positions all three boxes centrally at the start of the day.',
              'Keeps boxes locked when not in active use.',
              'Tracks all materials leaving the boxes throughout the day.',
              'Closes all boxes at day end — everything back in, locked, ready for warehouse transport.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Landlord Materials</strong></Para>
            <Ul items={[
              'Audits, photographs, and lists all landlord materials at the end of the day.',
              'Stores them separately — nothing mixed with Flent inventory.',
              'Confirms everything is accounted for and undamaged before the end of the day.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Utilities</strong></Para>
            <Ul items={[
              'Oversees WiFi installation — confirms SSID, sets password, tests on two devices.',
              'Oversees RO installation — confirms placement, captures RO ID, tests dispensing.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Appliances</strong></Para>
            <Ul items={[
              'Checks and confirms every appliance in the property.',
              'Flags anything not working to Ops immediately.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Room and Space Setup</strong></Para>
            <Ul items={[
              'Assists Design Ops with room setup — curtains, bedsheets, pillow cases, mattress, extension cords, table lamps.',
              'Leads living room setup — sofa, rug, curtains, dining furniture, décor under Design Ops direction.',
              'Leads kitchen and bathroom setup under Design Ops direction.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Keys</strong></Para>
            <Ul items={[
              'Handles all key duplication — authorised keys only, never restricted keys.',
              'Tags every set clearly.',
              'Hands one main door key to Ops before the day ends.',
              'Stores remaining keys in the lockbox.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Waste and Garbage</strong></Para>
            <Ul items={[
              'Keeps packaging and waste consolidated throughout the day — common areas stay clear.',
              'Arranges disposal by end of day, handles payment, and hands the invoice to Ops.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Vendor Support</strong></Para>
            <Ul items={[
              'Physical assistance to vendors when needed.',
              'Does not leave an assigned task without informing Ops first.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Paint Touch-Ups</strong></Para>
            <Para>Minor touch-ups as directed by Design Ops or Ops during the day.</Para>
            <Para style={{ marginTop: 10 }}><strong>Reporting</strong></Para>
            <Para>Flags missing items, damage, and anything off-plan to Ops in real time throughout the day.</Para>
            <Para style={{ marginTop: 10 }}><strong>Warehouse Returns</strong></Para>
            <Ul items={[
              'Stacks, labels, and confirms all items going back to warehouse at end of day.',
              'Nothing is left at the property that belongs in the warehouse.',
            ]} />
            <Para style={{ marginTop: 10 }}><strong>Spillover</strong></Para>
            <Ul items={[
              'Present on site the following day to handle all outstanding spillover items.',
              'Remains until everything is resolved and Ops signs off.',
            ]} />
          </SubSection>

          <SubSection title="Carpenter 1">
            <Ul items={[
              'Scope: Furniture assembly · shelves · curtain rods · wall elements · cabinet hinges',
              'Sequence: BR1 → BR3 → Living Room',
              'Non-negotiable: Confirm with Designer and Ops before exiting any room',
              "Escalate to Ops: Damaged furniture · wall fitting won't hold · missing item",
            ]} />
          </SubSection>

          <SubSection title="Carpenter 2">
            <Ul items={[
              'Scope: Furniture assembly · shelves · curtain rods · wall elements · cabinet hinges',
              'Sequence: BR2 → Kitchen → additional spaces',
              'Non-negotiable: Confirm with Designer and Ops before exiting any room',
              "Escalate to Ops: Damaged furniture · wall fitting won't hold · missing item",
            ]} />
          </SubSection>

          <SubSection title="Electrician 1">
            <Ul items={[
              'Scope: Lights · fans · sockets · exhaust fans · appliance points',
              'Sequence: BR1 → BR3 → Living Room',
              'Non-negotiable: Test every socket and fitting before exiting any room',
              'Escalate to Ops: Faulty switchboard · missing fitting · appliance point not live',
            ]} />
          </SubSection>

          <SubSection title="Electrician 2">
            <Ul items={[
              'Scope: Lights · fans · sockets · exhaust fans · appliance points',
              'Sequence: BR2 → Kitchen → additional spaces',
              'Non-negotiable: Test every socket and fitting before exiting any room',
              'Escalate to Ops: Faulty switchboard · missing fitting · appliance point not live',
            ]} />
          </SubSection>

          <SubSection title="Plumber">
            <Ul items={[
              'Scope: Taps · showers · geyser connections · RO inlet · washing machine inlet and outlet · leak checks',
              'Sequence: BR1 → BR2 → BR3 → Kitchen and Utility',
              'Non-negotiable: Run a leak check after every connection without exception',
              'Escalate to Ops: Incompatible fitting · missing part · low pressure',
            ]} />
          </SubSection>

          <SubSection title="Cleaner 1">
            <Ul items={[
              'Scope: Bedroom cleaning after vendors exit each set',
              'Sequence: Kitchen at 9:30 AM → BR1 → BR2 → BR3 → Living Room',
              'Non-negotiable: Do not enter a room until vendors have fully exited and Ops confirms',
              'Escalate to Ops: Room requires significantly more time than the schedule allows',
            ]} />
          </SubSection>

          <SubSection title="Cleaner 2">
            <Ul items={[
              'Scope: Bathroom cleaning after vendors exit each set',
              'Sequence: Assists Kitchen → BR1 bathroom → BR2 bathroom → BR3 and common bathroom → Kitchen',
              'Non-negotiable: Do not enter until vendors are out and Ops confirms',
              'Escalate to Ops: Room requires significantly more time than the schedule allows',
            ]} />
          </SubSection>

        </Section>

        {/* §7 Processes */}
        <Section num={7} title="Processes" open={!!open[7]} onToggle={() => toggle(7)}>

          <SubSection title="T-Day Box Management">
            <Para>Six boxes total, three used per setup. Padlock code: <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', padding: '1px 7px', borderRadius: 3, color: 'var(--accent, #c8963e)' }}>8508</span> — same across all boxes.</Para>
            <SopTable
              headers={['Box', 'Label', 'Trade']}
              rows={[
                ['Box 1', 'Carpenter Box 1', 'Carpentry'],
                ['Box 2', 'Carpenter Box 2', 'Carpentry'],
                ['Box 3', 'Electrician Box 1', 'Electrical'],
                ['Box 4', 'Electrician Box 2', 'Electrical'],
                ['Box 5', 'Plumber Box 1', 'Plumbing'],
                ['Box 6', 'Plumber Box 2', 'Plumbing'],
              ]}
            />
            <Para>Runner positions the three relevant boxes centrally at the start of the day. Each box is accessed only by its respective trade. The box is locked every time a vendor steps away. Runner tracks every material that leaves a box. At end of day, all materials go back in, boxes are locked, and Runner confirms with Ops before transport to warehouse.</Para>
          </SubSection>

          <SubSection title="WiFi Installation">
            <Para><strong>Naming convention — applies to all properties regardless of ISP:</strong></Para>
            <Ul items={[
              'SSID: Flent_(flat number) · Example: Flent_304',
              'Password: Flent@2k24',
            ]} />
            <Para><strong>Process:</strong></Para>
            <Ol items={[
              'Runner confirms technician arrival time at the morning briefing',
              'Runner meets the technician and escorts them to the router location — a central point, typically the living room or main hallway',
              'SSID and password set to the standard above',
              'Connection tested on at least two devices before the technician leaves',
              'Ops logs the account number, SSID, and password in the Utility Sheet immediately after installation',
            ]} />
          </SubSection>

          <SubSection title="RO and DrinkPrime Installation">
            <Ol items={[
              'Property details shared in the DrinkPrime WhatsApp group on T-2',
              'Installation targeted for T-1',
              'If T-1 is not possible, it is completed first thing on setup day before kitchen work begins',
              'Default placement is under the kitchen sink — if not feasible, Runner confirms alternate placement with Designer',
              'Runner oversees the installation, captures the RO ID, and tests that water is dispensing cleanly',
              'Ops logs all details in the Utility Sheet',
            ]} />
          </SubSection>

          <SubSection title="Key Duplication and Arrangement">
            <SopTable
              headers={['Property', 'Main Door Keys', 'Bedroom Keys']}
              rows={[
                ['1BHK', '2', '1'],
                ['2BHK', '3', '2'],
                ['3BHK', '4', '3'],
                ['4BHK+', '5', '4'],
              ]}
            />
            <Para>Main door set is tagged with the PID. Each bedroom key is tagged with its room — BR1, BR2, BR3.</Para>
            <Para>Runner handles all duplication during the day. Society master keys and any landlord-restricted keys are never duplicated. Before the day ends, one main door key is handed to Ops. The remaining keys go into the lockbox.</Para>
          </SubSection>

          <SubSection title="Lockbox Drilling">
            <Para>The lockbox is taped to the wall at T-5 as a temporary measure. It is drilled in permanently on setup day.</Para>
            <Para>Runner handles the drilling and installation. Location is at the property entrance — accessible but not immediately visible from outside. Password is <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', padding: '1px 7px', borderRadius: 3, color: 'var(--accent, #c8963e)' }}>8508</span>. Functionality is confirmed before end of day.</Para>
          </SubSection>

          <SubSection title="Appliance Check">
            <Para>Owner: Runner. Every appliance is checked before the room it is in is closed.</Para>
            <SopTable
              headers={['Appliance', 'What to Verify']}
              rows={[
                ['Fridge', 'Plugged in · cooling within 15 minutes · door seal intact'],
                ['Washing machine', 'Installed · inlet and outlet connected · test cycle completed · drainage confirmed'],
                ['Microwave', 'Plugged in · door closes properly · test run done'],
                ['Geyser', 'Connection confirmed · hot water flowing within 10 minutes'],
                ['TV', 'Placed or mounted · plugged in · powers on'],
                ['Any other appliance', 'Plugged in · basic function confirmed'],
              ]}
            />
            <Para>If an appliance is not working, Runner flags it to Ops immediately. Ops decides whether to fix it on the day, replace it, or log it as a spillover.</Para>
          </SubSection>

          <SubSection title="Landlord Materials Management">
            <Ol items={[
              "Runner to hand a cardboard box to all vendors and instruct them to store the landlord's belongings that come out of the property during the setup process, such as tubelights, frames, mirrors, remotes, or anything not for our use, in the box.",
              'At the end of the day, Runner audits, photographs, and lists every landlord item present in the property',
              'All items are stored in one designated area — nothing is mixed with Flent inventory',
              'Before leaving, Runner confirms every item is accounted for and undamaged',
              'If anything is damaged — stop, photograph it, and escalate to Ops before proceeding',
            ]} />
          </SubSection>

          <SubSection title="Onsite Procurement and Payment">
            <Para>Every purchase requires Ops approval before the runner leaves the property. No exceptions.</Para>
            <SopTable
              headers={['Category', 'Definition', 'Audited By']}
              rows={[
                ['opx-fix', 'Permanently installed — cannot be retrieved (shower fittings, channels, regulators)', 'Ops'],
                ['opx-invtr', 'Added to Flent inventory — not retrievable from the property', 'Ops'],
                ['capex-invtr', 'Can be retrieved and reused across properties (furniture, appliances, decor)', 'Designer'],
              ]}
            />
            <Para>Runner returns with the invoice and hands it to Ops.</Para>
          </SubSection>

          <SubSection title="Garbage and Waste Disposal">
            <Para>Runner consolidates packaging and waste throughout the day. Common areas remain clear at all times — waste does not accumulate in rooms. Disposal is arranged by end of day. Runner handles payment. For the property to be marked as complete, the runner also needs to submit the waste disposal form.</Para>
          </SubSection>

          <SubSection title="Post-Setup and Warehouse Returns">
            <Para>Before the day ends, Runner identifies, stacks, and labels everything going back to the warehouse. Confirmed with Ops before transport. T-Day boxes are closed and locked. Nothing that belongs in the warehouse remains at the property.</Para>
          </SubSection>

          <SubSection title="Arrival and Punctuality">
            <Para>9:15 AM is a hard cutoff. Vendors must inform Ops at least one hour before 9:15 AM if they are going to be late. No message is treated the same as a no-show.</Para>
            <SopTable
              headers={['Situation', 'Consequence']}
              rows={[
                ['Late 1 to 2 times in a month', 'Verbal flag from Ops, logged'],
                ['Late 3 or more times in a month', 'Brings breakfast for the full team at the next 3 setups, plus evening tea'],
                ['No-show without informing', 'Escalated to manager, formally documented'],
                ['Poor quality work', 'Discussed 1:1 with Ops'],
                ['Major damage caused', 'Documented and escalated to manager'],
              ]}
            />
          </SubSection>

          <SubSection title="Vendor Conduct">
            <Para>During setup hours, the focus is on work and completion. TAT is tracked — slacking that causes a spillover is flagged and logged. Phone use during active work is minimised. All interactions with society residents or security go through Ops, not directly through the vendor.</Para>
          </SubSection>

          <SubSection title="Breakfast and Lunch">
            <Para>Breakfast takes place during the briefing from 9:15 to 9:30 AM. Lunch runs from 1:00 to 3:00 PM in staggered batches so work does not come to a complete stop. Lunch and evening snacks are covered by the company — ₹5,000 monthly budget allocated.</Para>
          </SubSection>

        </Section>

        {/* §8 Standards */}
        <Section num={8} title="Standards" open={!!open[8]} onToggle={() => toggle(8)}>
          <Callout type="green">
            Every fitting in the property must function without fail for a minimum of six months. This applies to every trade, every room, without exception.
          </Callout>

          <SubSection title="Bathroom">
            <Para>All taps running without drip · Geyser heating and holding temperature · Exhaust fan running silently · Flush mechanism fully functional · Mirror present, secure, and clean · All fittings tightened — zero wobble · Drain flowing clear · Sanitised to Flent standard</Para>
          </SubSection>

          <SubSection title="Electrical">
            <Para>Every switch operational · Every socket live and tested · Every fan balanced and running on all speeds · Every light fitting secure · No exposed wiring anywhere · All switchboard covers fitted and tightened</Para>
          </SubSection>

          <SubSection title="Carpentry">
            <Para>Every door opens, closes, and locks correctly · Every drawer runs smooth on both sides · Every hinge calibrated — no squeaking · Every shelf level, stable, and load-bearing · Every curtain rod straight and anchored · Every wall fitting drilled in — no tape</Para>
          </SubSection>

          <SubSection title="Kitchen">
            <Para>Sink taps running, drainage clear · All appliances placed, tested, and functional · All electrical points live and accessible · Ventilation operational — exhaust fan or chimney · Surfaces clean and dry · Utensils arranged, nothing on the floor</Para>
          </SubSection>

          <SubSection title="Cleaning Standard">
            <Callout type="green">
              The benchmark: ten people walk in and not one of them finds anything to complain about. Every surface wiped, every corner done, every fixture spotless. No dust, no stains, no residue, no leftover packaging. Floors mopped, glass and mirrors wiped clean, bathrooms sanitised, kitchen clean and dry.
            </Callout>
          </SubSection>

        </Section>

        {/* §9 When Things Go Wrong */}
        <Section num={9} title="When Things Go Wrong" open={!!open[9]} onToggle={() => toggle(9)}>

          <SubSection title="Vendor Late Arrival">
            <Ul items={[
              'Under 30 minutes late — absorb it, redistribute their starting tasks to available vendors.',
              'Over 30 minutes late — Ops restructures assignments immediately and does not wait.',
              'Recurring pattern escalates to the manager.',
            ]} />
          </SubSection>

          <SubSection title="Vendor No-Show">
            <Para>Identify a backup within the team first. Redistribute critical tasks where the trade allows. Sourcing an external vendor is a last resort — if it comes to that, the manager is informed.</Para>
          </SubSection>

          <SubSection title="Vendor Altercation">
            <Para><strong>Between vendors</strong> — Ops steps in, separates the parties, and work continues. Both are flagged to the manager after the day ends.</Para>
            <Para><strong>With society residents or security</strong> — Ops handles it directly. The vendor disengages. If the society threatens to stop all work, the supply POC is contacted immediately.</Para>
          </SubSection>

          <SubSection title="Power Cut">
            <Ul items={[
              'Under 30 minutes — continue all non-electrical work. Electricians assist other trades.',
              "Over 30 minutes — flag in #core-expansion on Slack, inform the manager. Ops reassesses and adjusts the day's timeline.",
            ]} />
          </SubSection>

          <SubSection title="Accident On Site">
            <Ul items={[
              'Minor (small cuts, minor falls, no serious injury) — first aid on site, work continues, Ops logs and reports to the manager after the day.',
              'Major (serious injury, electrical shock, fall from height) — stop all work immediately. Emergency services if required. Manager is informed without delay.',
            ]} />
          </SubSection>

          <SubSection title="Society Conflict">
            <Para>Ops handles all society interactions — vendors do not engage directly. If the issue is about noise or timing, the relevant work pauses. If the society threatens to shut down work entirely, the supply POC is contacted immediately.</Para>
          </SubSection>

          <SubSection title="Property Damage">
            <Ul items={[
              'Minor (surface scuffs, small marks) — photograph it, note it, continue working. Runner does a touch-up where possible. Logged on the snag list.',
              'Major (structural damage, large breakage, significant cost implication) — stop work in the affected area, photograph everything, and escalate to the manager before anything else is done.',
            ]} />
          </SubSection>

          <SubSection title="Landlord Item Damage">
            <Ul items={[
              'Minor — photograph, inform Ops, continue working. Reported to the manager after the day.',
              'Major — stop work, photograph, Ops escalates to the manager. Manager handles all communication with the supply POC and landlord from that point.',
            ]} />
          </SubSection>

          <SubSection title="Setup Day Surprise">
            <Para>Something not identified during the T-5 inspection. The vendor flags it to Ops the moment it is found. Ops assesses whether it can be resolved today.</Para>
            <Ul items={[
              'Resolvable today → assign, fix, and log on the snag list',
              'Not resolvable today → logged as spillover and as an inspection lapse, flagged to the manager',
            ]} />
          </SubSection>

          <SubSection title="Missing Critical Material">
            <Ul items={[
              'Found at briefing — runner procures immediately and is back before 10:00 AM.',
              'Found mid-setup — Ops approves the run, runner goes out, work continues in unaffected areas.',
              'Cannot be sourced — logged as spillover, manager informed if it affects move-in readiness.',
            ]} />
          </SubSection>

          <SubSection title="Running Behind Schedule">
            <Ul items={[
              '30 minutes behind after the sets block — Ops deprioritises what can wait and protects the finishing block.',
              'One hour or more behind — manager is informed and jointly decides what moves to spillover.',
            ]} />
            <Para>Appliances, cleanliness, and all functional fixtures are never cut. Décor is the last thing to go.</Para>
          </SubSection>

          <SubSection title="Spillover">
            <Para>Any task not completed by 6:00 PM is spillover. Every spillover item is logged before Ops leaves the property — task, location, reason, resolution plan, and committed timeline. The manager is informed the same evening. Runner is on site the following day to resolve all items. A property cannot be handed over with a move-in critical item still outstanding. All spillover is resolved within 24 hours unless the manager agrees otherwise.</Para>
          </SubSection>

          <SubSection title="Escalation Matrix">
            <SopTable
              headers={['Level', 'Who Raises It', 'Situation', 'Contact', 'Response']}
              rows={[
                ['1', 'Any vendor or Runner', 'Trade issue · snag · missing material · quality concern', 'Ops Associate', 'Within 5 min'],
                ['2', 'Ops Associate', 'Cannot resolve on site · major damage · no-show · accident', 'Manager', 'Within 15 min'],
                ['2', 'Ops Associate', 'Society conflict threatening to stop work', 'Supply POC', 'Within 15 min'],
                ['2', 'Design Ops Associate', 'Inter-associate priority conflict', 'Respective managers', 'Within 15 min'],
                ['3', 'Manager', 'Landlord conflict · major damage with cost implication · access blocked', 'Supply POC', 'Within 30 min'],
                ['3', 'Manager', 'Legal issue · safety concern · structural problem', 'Senior leadership', 'Immediately'],
              ]}
            />
          </SubSection>

        </Section>

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.footerText}>
            Property locked. Lockbox secured. Keys confirmed with Ops. Everyone off-site by 6:00 PM.
          </span>
        </div>

      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100dvh',
    background: 'var(--bg, #16171f)',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  pageHeader: {
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    padding: '20px 24px 24px',
    paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 16,
    display: 'block',
  },
  docBadge: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--accent, #c8963e)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  docTitle: {
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.4px',
    margin: '0 0 12px',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px 8px',
    alignItems: 'center',
  },
  metaItem: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
  },
  metaSep: {
    color: 'var(--border, #2e3040)',
    fontSize: 11,
  },
  statusBadge: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--accent, #c8963e)',
    background: 'rgba(200,150,62,0.12)',
    border: '1px solid rgba(200,150,62,0.3)',
    borderRadius: 4,
    padding: '2px 8px',
  },
  doc: {
    maxWidth: 860,
    margin: '0 auto',
  },
  footer: {
    padding: '20px 24px',
    borderTop: '1px solid var(--border, #2e3040)',
    textAlign: 'center',
    background: 'var(--bg-panel, #1e2028)',
  },
  footerText: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    fontStyle: 'italic',
  },
}
