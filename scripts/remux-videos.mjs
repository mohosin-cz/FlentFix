/**
 * remux-videos.mjs — one-time faststart remux for all video rows in line_item_media.
 *
 * Requires:
 *   - ffmpeg installed and on PATH
 *   - SUPABASE_SERVICE_ROLE_KEY env var (never commit this value)
 *   - Node 18+ (built-in fetch)
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/remux-videos.mjs
 *
 * Dry-run (detect-only, no writes):
 *   SUPABASE_SERVICE_ROLE_KEY=<key> DRY_RUN=1 node scripts/remux-videos.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { execFile }      from 'child_process'
import { promisify }     from 'util'
import { writeFile, readFile, unlink, mkdtemp, rm } from 'fs/promises'
import { tmpdir }        from 'os'
import { join, extname } from 'path'

const execFileP = promisify(execFile)

// ── Config ────────────────────────────────────────────────────────────────────
const BUCKET       = 'inspection-media'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pjetqnlvyuuejcuvkare.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN      = process.env.DRY_RUN === '1'

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY env var is required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── MP4 atom parser ───────────────────────────────────────────────────────────
function findTopLevelAtoms(buf) {
  const atoms = {}
  let offset = 0
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset)
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii')
    if (!atoms[type]) atoms[type] = offset
    if (size === 0) break  // box extends to EOF
    if (size < 8)  break  // corrupt
    if (size === 1) break  // 64-bit extended size — bail
    offset += size
  }
  return atoms
}

// Returns true=faststart, false=not faststart, null=inconclusive (buffer too short).
// Always pass a cache-busted URL for post-upload verification.
async function isFaststart(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
    if (!res.ok && res.status !== 206) {
      console.log(`    range-check HTTP ${res.status}`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const atoms = findTopLevelAtoms(buf)
    if (atoms.moov !== undefined && atoms.mdat !== undefined) return atoms.moov < atoms.mdat
    if (atoms.moov !== undefined) return true   // moov in first 64 KB, mdat not yet
    if (atoms.mdat !== undefined) return false  // mdat seen before moov
    return null
  } catch (e) {
    console.log(`    range-check error: ${e.message}`)
    return null
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`

function storagePathFromUrl(url) {
  const bare = url.split('?')[0]
  const idx = bare.indexOf(PUBLIC_PREFIX)
  if (idx !== -1) return decodeURIComponent(bare.slice(idx + PUBLIC_PREFIX.length))
  const signedPrefix = `/storage/v1/object/sign/${BUCKET}/`
  const idx2 = bare.indexOf(signedPrefix)
  if (idx2 !== -1) return decodeURIComponent(bare.slice(idx2 + signedPrefix.length))
  return null
}

function publicUrl(storagePath) {
  return `${SUPABASE_URL}${PUBLIC_PREFIX}${storagePath.split('/').map(encodeURIComponent).join('/')}`
}

async function downloadFile(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download HTTP ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(destPath, buf)
  return buf.length
}

// Upload to Supabase storage with loud per-file logging.
// FIX 1: upload() + upsert:true can still 409 on existing paths in some storage
// versions — detect and retry with update() (PUT) which always overwrites.
async function uploadFile(storagePath, filePath, contentType = 'video/mp4') {
  const buf = await readFile(filePath)
  const mb  = (buf.length / 1048576).toFixed(2)
  console.log(`    📤 upload  ${mb} MB → ${storagePath}`)

  let { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, { upsert: true, contentType })

  // FIX 1b: 409 fallback — update() uses HTTP PUT, bypasses upsert quirks
  const is409 = error && (
    String(error.statusCode) === '409' ||
    /duplicate|already\s+exists|409/i.test(error.message || '')
  )
  if (is409) {
    console.log(`    ↩  upload() 409 — retrying with update()`)
    ;({ data, error } = await supabase.storage
      .from(BUCKET)
      .update(storagePath, buf, { upsert: true, contentType }))
  }

  // FIX 2: loud error logging — a failed upload must never read as success
  if (error) {
    console.error(`    ❌ STORAGE ERROR: ${JSON.stringify(error)}`)
    throw new Error(`Storage write failed [${storagePath}]: ${error.message} (status: ${error.statusCode})`)
  }

  console.log(`    ✓  stored: ${data?.path ?? storagePath}`)
}

// ── Per-file processor ────────────────────────────────────────────────────────
async function processRow(row, tmpDir) {
  const { id: rowId, url } = row
  const ext  = extname(url.split('?')[0]).toLowerCase()
  const isMov = ext === '.mov'
  const isMp4 = ext === '.mp4'

  if (!isMov && !isMp4) {
    return { rowId, url, status: 'skipped', reason: `unsupported ext "${ext}"` }
  }

  // 1. Check if already faststart (bare URL — pre-state check, CDN cache is fine here)
  const already = await isFaststart(url)
  if (already === true) {
    return { rowId, url, status: 'ok', reason: 'already faststart' }
  }

  const storagePath = storagePathFromUrl(url)
  if (!storagePath) {
    return { rowId, url, status: 'skipped', reason: 'could not parse storage path from URL' }
  }

  if (DRY_RUN) {
    return {
      rowId, url, storagePath, status: 'dry-run',
      reason: already === false ? 'needs remux (mdat before moov)' : 'moov/mdat unclear in first 64 KB — would remux',
    }
  }

  // 2. Download
  const inPath  = join(tmpDir, `in${ext}`)
  const outPath = join(tmpDir, `out.mp4`)
  const dlBytes = await downloadFile(url, inPath)
  console.log(`    ⬇  downloaded ${(dlBytes / 1048576).toFixed(2)} MB`)

  // 3. Remux with ffmpeg
  // FIX 3a: any non-zero exit from ffmpeg is a hard error — no "Error" keyword filter
  const ffmpegArgs = isMp4
    ? ['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath]
    : ['-y', '-i', inPath, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
       '-c:a', 'aac', '-movflags', '+faststart', outPath]

  try {
    await execFileP('ffmpeg', ffmpegArgs, { maxBuffer: 10 * 1024 * 1024 })
  } catch (e) {
    throw new Error(`ffmpeg exited ${e.code}: ${(e.stderr || e.message).slice(-400)}`)
  }

  // 4. Upload — MOV gets a new .mp4 path; MP4 overwrites in place
  const newStoragePath = isMov ? storagePath.replace(/\.mov$/i, '.mp4') : storagePath
  await uploadFile(newStoragePath, outPath)

  // 5. Update DB row URL for MOV → MP4 conversions
  let newUrl = isMov ? publicUrl(newStoragePath) : url
  if (isMov) {
    const { error: dbErr } = await supabase
      .from('line_item_media')
      .update({ url: newUrl })
      .eq('id', rowId)
    if (dbErr) throw new Error(`DB update failed for row ${rowId}: ${dbErr.message}`)
    console.log(`    🗄  db row updated → ${newUrl}`)
  }

  // FIX 3b: verify with a cache-busted URL — CDN caches bare URLs for 3600 s
  const verifyUrl = `${newUrl.split('?')[0]}?cb=${Date.now()}`
  console.log(`    🔍 verifying (cache-busted)`)
  const verified = await isFaststart(verifyUrl)

  await Promise.allSettled([unlink(inPath), unlink(outPath)])

  return {
    rowId, url, newUrl, storagePath, newStoragePath,
    dlBytes,
    status: verified === true ? 'remuxed' : 'remuxed-unverified',
    faststart: verified,
    reason: verified === true
      ? 'moov now before mdat ✓'
      : verified === false
        ? '⚠ moov still after mdat — upload may not have taken'
        : 'uploaded; range-check inconclusive (file may be too large for 64 KB window)',
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎬  remux-videos  [${DRY_RUN ? 'DRY RUN' : 'LIVE'}]`)
  console.log(`    bucket : ${BUCKET}`)
  console.log(`    project: ${SUPABASE_URL}\n`)

  let allRows = [], from = 0
  while (true) {
    const { data, error } = await supabase
      .from('line_item_media')
      .select('id, url, is_proof_video')
      .eq('type', 'video')
      .range(from, from + 999)
    if (error) { console.error('❌  DB fetch failed:', error.message); process.exit(1) }
    if (!data?.length) break
    allRows = allRows.concat(data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`Found ${allRows.length} video rows\n`)
  if (!allRows.length) { console.log('Nothing to do.'); return }

  const buckets = { ok: [], remuxed: [], unverified: [], skipped: [], failed: [] }
  let tmpDir = null

  for (let i = 0; i < allRows.length; i++) {
    const row    = allRows[i]
    const fname  = row.url.split('/').pop()?.split('?')[0] ?? row.id
    console.log(`\n[${i + 1}/${allRows.length}] ${fname}  (row ${row.id})`)

    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'remux-'))
      const result = await processRow(row, tmpDir)
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      tmpDir = null

      const icon = { ok: '✓', remuxed: '✅', 'dry-run': '🔍', skipped: '–', 'remuxed-unverified': '⚠' }[result.status] ?? '?'
      console.log(`    → ${icon} ${result.status}: ${result.reason}`)

      if      (result.status === 'ok')                 buckets.ok.push(result)
      else if (result.status === 'remuxed')            buckets.remuxed.push(result)
      else if (result.status === 'remuxed-unverified') buckets.unverified.push(result)
      else                                             buckets.skipped.push(result)
    } catch (e) {
      console.error(`    → ❌ FAILED: ${e.message}`)
      buckets.failed.push({ ...row, error: e.message })
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      tmpDir = null
    }
  }

  // ── Per-file report ───────────────────────────────────────────────────────
  console.log('\n══════════════════ PER-FILE REPORT ══════════════════')
  for (const r of [...buckets.remuxed, ...buckets.unverified]) {
    console.log(`  ✅ ${r.rowId}`)
    console.log(`     before : ${r.url}`)
    if (r.url !== r.newUrl) console.log(`     after  : ${r.newUrl}`)
    console.log(`     faststart verified: ${r.faststart}  |  ${r.reason}`)
  }
  for (const r of buckets.failed) {
    console.log(`  ❌ ${r.id}  ${r.url}`)
    console.log(`     error: ${r.error}`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════ SUMMARY ═══════════════════════')
  console.log(`  ✓  already faststart   : ${buckets.ok.length}`)
  console.log(`  ✅  remuxed + verified  : ${buckets.remuxed.length}`)
  console.log(`  ⚠  remuxed, unverified : ${buckets.unverified.length}`)
  console.log(`  –  skipped             : ${buckets.skipped.length}`)
  console.log(`  ❌  failed              : ${buckets.failed.length}`)
  console.log('═══════════════════════════════════════════════════════\n')

  if (buckets.failed.length) process.exit(1)
}

main().catch(e => { console.error('\n❌ Unhandled error:', e); process.exit(1) })
