import imageCompression from 'browser-image-compression'

const BUCKET = 'inspection-media'
const VIDEO_RE = /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv|avi)$/i

// MIME type first, filename second.
//
// Android is the reason. Its camcorder writes .3gp and .mkv, and its file
// pickers routinely hand over a File whose name has no extension at all —
// neither of which the extension test recognises, so a video would be sent
// through the image compressor, lose its poster frame, and skip the
// large-file warning. file.type is set reliably by both the camera and the
// picker, so it leads and the extension is only a fallback.
function isVideoFile(file) {
  if (file?.type) return file.type.startsWith('video/')
  return VIDEO_RE.test(file?.name || '')
}

// An extension we are willing to put on a storage path: letters/digits, short,
// and actually present. "image".split(".").pop() returns "image", not
// undefined, so a name with no dot would otherwise sail past a `|| 'jpg'`
// fallback and upload a file called `…item.image` that nothing can render.
function safeExt(name, fallback) {
  const i = (name || '').lastIndexOf('.')
  if (i < 1) return fallback
  const ext = name.slice(i + 1).toLowerCase()
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback
}

// Prefer the extension implied by the MIME type — it is what the file actually
// is, rather than what it happens to be called.
function extFromType(type, fallback) {
  const sub = (type || '').split('/')[1]
  if (!sub) return fallback
  const clean = sub.split(';')[0].toLowerCase()
  const map = { quicktime: 'mov', 'x-matroska': 'mkv', '3gpp': '3gp', jpeg: 'jpg', 'svg+xml': 'svg' }
  const ext = map[clean] || clean
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback
}

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

// Grab a frame of a video as a WebP blob (used as poster thumbnail).
// Waits for the seek to land so there is a decoded frame to draw — grabbing on
// loadeddata saved blank white posters on iPhones — and returns null rather
// than a blank image, so no poster beats a wrong one.
export async function videoFirstFrame(file) {
  return new Promise(resolve => {
    const u = URL.createObjectURL(file)
    const video = document.createElement('video')
    let done = false
    const finish = (blob) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(u); resolve(blob) }
    const timer = setTimeout(() => finish(null), 8000)
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.onloadedmetadata = () => { try { video.currentTime = Math.min(0.5, (video.duration || 1) / 2) } catch { finish(null) } }
    video.onseeked = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null)
        const w = Math.min(video.videoWidth, 640)
        const h = Math.round(w / video.videoWidth * video.videoHeight)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, w, h)
        // blank check: sample a grid; all one flat colour means no frame was drawn
        const px = ctx.getImageData(0, 0, w, h).data
        let min = 255, max = 0
        for (let y = 0; y < h; y += Math.max(1, h >> 4)) for (let x = 0; x < w; x += Math.max(1, w >> 4)) {
          const i = (y * w + x) * 4, v = (px[i] + px[i + 1] + px[i + 2]) / 3
          if (v < min) min = v; if (v > max) max = v
        }
        if (max - min < 6) return finish(null)
        canvas.toBlob(blob => finish(blob), 'image/webp', 0.80)
      } catch { finish(null) }
    }
    video.onerror = () => finish(null)
    video.src = u
    video.load()
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
  const isVid = isVideoFile(file)

  if (isVid && file.size > 20 * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(0)
    const ok = window.confirm(`This video is ${mb} MB — large videos may load slowly for landlords. Upload anyway?`)
    if (!ok) return null
  }

  let uploadPath, uploadFile, thumbBlob = null

  if (isVid) {
    const ext = extFromType(file.type, safeExt(file.name, 'mp4'))
    uploadPath = `${baseName}.${ext}`
    uploadFile = file
    thumbBlob = await videoFirstFrame(file).catch(() => null)
  } else {
    const { full, thumb } = await compressImage(file)
    const compressed = full !== file
    const ext = compressed ? 'webp' : extFromType(file.type, safeExt(file.name, 'jpg'))
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
