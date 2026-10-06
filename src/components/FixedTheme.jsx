// A page that does not follow the staff member's theme.
//
// Everything a landlord or a vendor receives — an estimate, an invoice, a work
// order, a rate card — is a document, and a document has one appearance. It is
// read on someone else's phone, printed, saved as a PDF and attached to an
// email months later, and none of those should depend on whether the person
// who sent it likes dark mode. The signed copy held on the record has to look
// like the copy that was signed.
//
// So those pages pin the palette instead of inheriting it. data-theme on a
// wrapper is enough: the tokens in theme.css are defined per [data-theme], and
// custom properties inherit down the DOM whatever the display type — which is
// why this is `display: contents` and adds no box, no margin and no stacking
// context to layouts that were built without it.
export default function FixedTheme({ theme = 'dark', children }) {
  return <div data-theme={theme} style={{ display: 'contents' }}>{children}</div>
}
