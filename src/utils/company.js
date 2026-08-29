// Slaash Technologies Pvt Ltd — the legal entity behind Flent, as it has to
// appear on anything issued to a landlord or signed by a vendor.
//
// It was written out by hand in three places on the tax invoice and stored a
// fourth time in payroll_billing_entity, and the copies had already drifted:
// two of them carried a GSTIN ending in a zero and an address with the wrong
// pincode. One definition here, so the next correction only has to be made once.
//
// On the GSTIN: the fifteenth character is a checksum over the first fourteen,
// and for 29ABLCS8677C1Z it computes to the letter O. The '0' that was in the
// code and in the database made the number invalid — an easy typo to make and
// an expensive one to leave on a tax document.
//
// Vendor invoices do NOT read this constant. They stamp payroll_billing_entity
// into each invoice's snapshot at send time, because that block is editable by
// staff and has to be frozen per invoice. This is the value that row should
// hold; supabase/migrations/invoice_billto_backfill.sql sets it.

export const COMPANY = {
  legal_name: 'Slaash Technologies Pvt Ltd',
  brand: 'Flent',
  address_line: 'The Mayfair, 100 Feet Rd, Binnamangala, Stage 1, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  state_code: '29',
  pincode: '560038',
  gstin: '29ABLCS8677C1ZO',
  // No PAN. Nothing prints it, and characters 3–12 of the GSTIN are the PAN in
  // any case, so carrying it separately bought nothing.
}

// "The Mayfair, 100 Feet Rd, …, Bengaluru, Karnataka 560038"
export const COMPANY_ADDRESS =
  `${COMPANY.address_line}, ${COMPANY.city}, ${COMPANY.state} ${COMPANY.pincode}`
