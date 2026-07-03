import imageCompression from 'browser-image-compression'

const BUCKET = 'inspection-media'
const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i

// Derive the _thumb URL for any media file. Works for both images and videos.
// For images: .webp → _thumb.webp; .jpg → _thumb.webp
// For videos: .mp4 → _thumb.webp (poster from first frame)
// Falls back to the original URL for anything that doesn't match a known extension.
export function thumbUrl(url) {
  if (!url) return url
  const dot = url.lastIndexOf('.')
  if (dot < 0) return url
  return url.slice(0, dot) + '_thumb.webp'
}

async function needsCompression(file) {
  if (file.size > 400 * 1024) return true
  return new Promise(resolve => {
    const img = new Image()
    const u = URL.createObjectURL(file)
    img.onload  = () => { URL.revokeObjectURL(u); resolve(img.naturalWidth > 2048 || img.naturalHeight > 2048) }
    img.onerror = () => { URL.revokeObjectURL(u); resolve(false) }
    img.src = u
  })
}

// Compress image → WebP. Returns { full, thumb } blobs.
// If the file is already ≤400KB AND ≤2048px, returns the original file + no thumb.
export async function compressImage(file) {
  try {
    const compress = await needsCompression(file)
    if (!compress) return { full: file, thumb: null }
    const [full, thumb] = await Promise.all([
      imageCompression(file, { maxSizeMB: 0.4, maxWidthOrHeight: 2048, useWebWorker: true, fileType: 'image/webp', initialQuality: 0.80 }),
      imageCompression(file, { maxSizeMB: 0.025, maxWidthOrHeight: 320,  useWebWorker: true, fileType: 'image/webp', initialQuality: 0.70 }),
    ])
    return { full, thumb }
  } catch (e) {
    console.warn('[compressImage] failed, using original:', e.message)
    return { full: file, thumb: null }
  }
}

// Grab the first frame of a video as a WebP blob (used as poster thumbnail).
export async function videoFirstFrame(file) {
  return new Promise(resolve => {
    const u = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = u
    video.currentTime = 0.5
    video.onloadeddata = () => {
      try {
        const w = Math.min(video.videoWidth || 640, 640)
        const h = video.videoHeight
          ? Math.round(w / video.videoWidth * video.videoHeight)
          : Math.round(w * 9 / 16)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob(blob => { URL.revokeObjectURL(u); resolve(blob) }, 'image/webp', 0.80)
      } catch { URL.revokeObjectURL(u); resolve(null) }
    }
    video.onerror = () => { URL.revokeObjectURL(u); resolve(null) }
  })
}

// Upload a file (image or video) to inspection-media.
// baseName must NOT include an extension (e.g. "pid/item_ts_rand").
// Automatically:
//   images → compress to WebP, upload full + _thumb.webp
//   videos → upload original, generate poster → _thumb.webp
//   large videos (>40MB) → confirm before uploading
// Returns the public URL of the main file, or null if the user cancelled.
// Never throws — on compression failure it falls back to the original file.
export async function uploadMedia(supabase, file, baseName) {
  const isVid = VIDEO_RE.test(file.name)

  if (isVid && file.size > 40 * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(0)
    const ok = window.confirm(`This video is ${mb} MB — large files can slow the estimate. Upload anyway?`)
    if (!ok) return null
  }

  let uploadPath, uploadFile, thumbBlob = null

  if (isVid) {
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
    uploadPath = `${baseName}.${ext}`
    uploadFile = file
    thumbBlob = await videoFirstFrame(file).catch(() => null)
  } else {
    const { full, thumb } = await compressImage(file)
    const compressed = full !== file
    const ext = compressed ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase()
    uploadPath = `${baseName}.${ext}`
    uploadFile = full
    thumbBlob = thumb
  }

  const { data: up, error } = await supabase.storage.from(BUCKET).upload(uploadPath, uploadFile, { upsert: true })
  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(up.path)

  if (thumbBlob) {
    const thumbPath = `${baseName}_thumb.webp`
    await supabase.storage.from(BUCKET).upload(thumbPath, thumbBlob, { upsert: true }).catch(e => {
      console.warn('[uploadMedia] thumb upload failed:', e.message)
    })
  }

  return publicUrl
}
