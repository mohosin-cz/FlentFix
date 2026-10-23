// A still of a video, drawn by the browser from the video itself.
//
// The _thumb.webp posters saved at upload are often blank: on iPhones the
// first-frame grab ran before the video had a frame, and a white 3 KB image
// was saved as its preview. Asking the browser for the frame at 0.1s with
// preload="metadata" shows the real picture and fetches only a little of the
// file. Decorative and non-interactive — the tile around it handles the tap.
export default function VideoFrame({ url, className, style }) {
  if (!url) return null
  return (
    <video src={`${url.split('#')[0]}#t=0.1`} preload="metadata" muted playsInline disablePictureInPicture
      tabIndex={-1} aria-hidden="true" className={className}
      style={{ pointerEvents: 'none', ...style }} />
  )
}
