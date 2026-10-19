// Asset vocabulary, shared by the register, the form and the vendor profile.
// Kept out of the component files so none of them exports anything but a
// component — otherwise fast refresh stops working for the whole module.

export const CATEGORIES = ['Tool', 'Device', 'Vehicle', 'Uniform', 'Safety', 'Furniture', 'Other']
export const CONDITIONS = ['new', 'good', 'fair', 'poor']

export const STATUS_META = {
  in_stores: { label: 'In stores', color: 'var(--text-dim, #9394a8)',   bg: 'rgba(147,148,168,0.10)' },
  assigned:  { label: 'Assigned',  color: 'var(--green, #6f9a7e)',      bg: 'rgba(111,154,126,0.10)' },
  returned:  { label: 'Returned',  color: 'var(--text-muted, #6b6d82)', bg: 'rgba(147,148,168,0.08)' },
  lost:      { label: 'Lost',      color: 'var(--red, #b0645b)',        bg: 'rgba(176,100,91,0.10)' },
  damaged:   { label: 'Damaged',   color: 'var(--accent, #c8963e)',     bg: 'rgba(200,150,62,0.10)' },
}

export const assetMoney = n =>
  (n == null || n === '' ? null : '₹' + Math.round(Number(n)).toLocaleString('en-IN'))
