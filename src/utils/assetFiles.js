import { compressForUpload, newSubmissionId } from './vendorOnboard'

// Files attached to an asset: the purchase invoice, and a photo of the item
// itself at handover.
//
// Both live in vendor-docs (private, already accepts the anonymous inserts the
// vendor side needs) under assets/<request-id>/, which the log RPC checks the
// stored paths against.

export const IMAGE_ONLY = 'image/*'
export const IMAGE_OR_PDF = 'image/*,application/pdf'

export const assetFolder = (id) => `assets/${id}`

export const isPdf = (file) =>
  file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')

export const isPdfPath = (path) => /\.pdf$/i.test(path || '')

// A photographed bill or item is worth compressing; a PDF is not — running one
// through an image compressor produces a file that fails to re-encode and then
// gets written out with a .jpg extension, so nothing can open it afterwards.
export async function uploadAssetFile(supabase, folder, file, name = 'file') {
  const nonce = newSubmissionId().slice(0, 8)
  let body = file, ext = 'pdf', type = 'application/pdf'

  if (!isPdf(file)) {
    const out = await compressForUpload(file)
    body = out.file
    ext = out.ext
    type = out.file.type || 'image/jpeg'
  }

  const path = `${folder}/${name}-${nonce}.${ext}`
  const { data, error } = await supabase.storage
    .from('vendor-docs')
    .upload(path, body, { contentType: type })
  if (error) throw error
  return data.path
}
