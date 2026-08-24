// The request pipeline, in one place so the vendor's rail and the staff
// controls cannot disagree about what comes after what.

export const STAGES = [
  { key: 'requested',     short: 'Requested', label: 'Waiting for approval' },
  { key: 'pending_order', short: 'On order',  label: 'Approved — pending order' },
  { key: 'received',      short: 'Received',  label: 'Order received' },
  { key: 'deployed',      short: 'Deployed',  label: 'Handed over' },
  { key: 'logged',        short: 'Logged',    label: 'Details logged' },
]

export const stageIndex = (status) => {
  const i = STAGES.findIndex(s => s.key === status)
  return i === -1 ? 0 : i
}

// What comes next, for the staff advance button. null = nothing further.
export const nextStage = (status) => {
  const i = stageIndex(status)
  if (status === 'denied' || status === 'logged') return null
  return STAGES[i + 1]?.key === 'logged' ? null : STAGES[i + 1] || null
}

export const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label]))

// A vehicle has a registration and a chassis number; a backpack has neither.
// Rather than columns that are null for most items, each category asks for
// what that kind of thing actually carries.
export const DETAIL_FIELDS = {
  Device: [
    { key: 'imei', label: 'IMEI', mono: true },
    { key: 'model', label: 'Model', placeholder: 'e.g. Redmi 12' },
  ],
  Tool: [
    { key: 'make', label: 'Make', placeholder: 'e.g. Bosch' },
    { key: 'model', label: 'Model' },
  ],
  Uniform: [
    { key: 'size', label: 'Size', placeholder: 'e.g. L' },
    { key: 'issued_count', label: 'How many sets' },
  ],
  Safety: [
    { key: 'size', label: 'Size' },
    { key: 'expiry', label: 'Expiry (if any)' },
  ],
  Furniture: [
    { key: 'make', label: 'Make' },
    { key: 'location', label: 'Where it is kept' },
  ],
  Vehicle: [
    { key: 'registration', label: 'Registration number', mono: true, placeholder: 'e.g. KA01AB1234' },
    { key: 'chassis', label: 'Chassis number', mono: true },
    { key: 'engine', label: 'Engine number', mono: true },
    { key: 'model', label: 'Make & model', placeholder: 'e.g. Honda Activa' },
  ],
  Other: [
    { key: 'model', label: 'Make / model (if any)' },
    { key: 'note', label: 'Anything else worth noting' },
  ],
}
