export const HIGH_VALUE_VIDEO_THRESHOLD = 1500

// Validates a proof video file in-browser before upload.
// Rejects if duration < 10s or if the video is landscape (not portrait).
export function validateProofVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.preload = 'metadata'
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (vid.duration < 10) {
        return reject(new Error('Too short — record at least 10 seconds.'))
      }
      if (vid.videoWidth >= vid.videoHeight) {
        return reject(new Error('Hold the phone vertically and re-record.'))
      }
      resolve(file)
    }
    vid.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read video — try again.'))
    }
    vid.src = url
  })
}
