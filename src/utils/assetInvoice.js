import { compressForUpload, newSubmissionId } from './vendorOnboard'

// Upload a purchase invoice for an asset.
//
// Lives in vendor-docs (private, already accepts the anonymous inserts the
// vendor side needs) under an asset-invoices/ prefix, which the log RPC checks
// the stored path against.

export const INVOICE_ACCEPT = 'image/*,application/pdf'

export const isPdf = (file) =>
  file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')

// A photographed bill is worth compressing; a PDF is not — running one through
// an image compressor produces a file that fails to re-encode and then gets
// written out with a .jpg extension, so nothing can open it afterwards.
export async function uploadAssetInvoice(supabase, folder, file) {
  const nonce = newSubmissionId().slice(0, 8)
  let body = file, ext = 'pdf', type = 'application/pdf'

  if (!isPdf(file)) {
    const out = await compressForUpload(file)
    body = out.file
    ext = out.ext
    type = out.file.type || 'image/jpeg'
  }

  const path = `${folder}/invoice-${nonce}.${ext}`
  const { data, error } = await supabase.storage
    .from('vendor-docs')
    .upload(path, body, { contentType: type })
  if (error) throw error
  return data.path
}

export const invoiceIsPdfPath = (path) => /\.pdf$/i.test(path || '')
