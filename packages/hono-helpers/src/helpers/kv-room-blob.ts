/**
 * Small, immutable room-scene blobs on Workers KV for deployments without R2.
 *
 * An upload is split into 4 MiB pieces (below KV's 25 MiB value cap). The
 * manifest is written LAST, so a failed upload is never advertised as complete.
 * Names contain random UUIDs from storage, so neither overwrite nor deletion of
 * previously published saves is needed for room save history.
 *
 * Workers KV is eventually consistent. A new key may take time to appear in
 * another Cloudflare location; it is suitable for a small free revival, not a
 * replacement for strongly consistent object storage at scale.
 */
export const ROOM_BLOB_CHUNK_BYTES = 4 * 1024 * 1024
export const ROOM_BLOB_MAX_BYTES = 64 * 1024 * 1024

type Manifest = {
	version: 1
	length: number
	parts: number
	etag: string
}

const manifestKey = (key: string) => `recflare-room:${key}:manifest`
const partKey = (key: string, index: number) => `recflare-room:${key}:part:${index}`

/** Store a room scene or room metadata blob using the original CDN object key. */
export async function putKvRoomBlob(
	kv: KVNamespace,
	key: string,
	bytes: ArrayBuffer,
	sha256: ArrayBuffer
): Promise<void> {
	if (!key.startsWith('room/') || key.includes('..')) throw new Error('Invalid room blob key')
	if (bytes.byteLength > ROOM_BLOB_MAX_BYTES) throw new RangeError('Room blob exceeds free storage limit')
	const raw = new Uint8Array(bytes)
	const parts = Math.max(1, Math.ceil(raw.byteLength / ROOM_BLOB_CHUNK_BYTES))
	for (let i = 0; i < parts; i++) {
		const start = i * ROOM_BLOB_CHUNK_BYTES
		const chunk = raw.slice(start, start + ROOM_BLOB_CHUNK_BYTES)
		await kv.put(partKey(key, i), chunk.buffer)
	}
	const etag = Array.from(new Uint8Array(sha256), (b) => b.toString(16).padStart(2, '0')).join('')
	const manifest: Manifest = { version: 1, length: raw.length, parts, etag }
	await kv.put(manifestKey(key), JSON.stringify(manifest))
}

/** Check only the manifest; used for Studio HEAD lookups and fallback detection. */
export async function headKvRoomBlob(
	kv: KVNamespace | undefined,
	key: string
): Promise<{ length: number; etag: string } | null> {
	if (!kv || !key.startsWith('room/') || key.includes('..')) return null
	const m = await kv.get<Manifest>(manifestKey(key), 'json')
	if (!m || m.version !== 1 || !Number.isSafeInteger(m.length) || m.length < 0) return null
	return { length: m.length, etag: m.etag }
}

/**
 * Return an HTTP response for a stored room blob, or null if the key isn't
 * present (the caller can try legacy R2). Byte ranges must be fulfilled by
 * the returned bytes themselves, not by an upstream cache slicing a 200.
 */
export async function getKvRoomBlob(
	kv: KVNamespace | undefined,
	key: string,
	request: Request
): Promise<Response | null> {
	if (!kv || !key.startsWith('room/') || key.includes('..')) return null
	const m = await kv.get<Manifest>(manifestKey(key), 'json')
	if (!m || m.version !== 1 || !Number.isSafeInteger(m.parts) || m.parts < 1) return null
	if (!Number.isSafeInteger(m.length) || m.length < 0 || m.length > ROOM_BLOB_MAX_BYTES) return null
	const headers = new Headers({
		'content-type': 'application/octet-stream',
		'accept-ranges': 'bytes',
		'cache-control': 'public, max-age=2592000',
		etag: `"${m.etag}"`,
		'x-content-type-options': 'nosniff',
	})
	const ifNoneMatch = request.headers.get('if-none-match')
	if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === '*' ||
		tag.trim().replace(/^W\//, '') === `"${m.etag}"`)) {
		return new Response(null, { status: 304, headers })
	}

	let start = 0
	let end = m.length - 1
	let partial = false
	const range = request.headers.get('range')
	if (range) {
		const parsed = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
		if (!parsed || (!parsed[1] && !parsed[2]) || m.length === 0) {
			headers.set('content-range', `bytes */${m.length}`)
			return new Response(null, { status: 416, headers })
		}
		if (!parsed[1]) {
			const suffix = Number(parsed[2])
			if (!Number.isSafeInteger(suffix) || suffix <= 0) {
				headers.set('content-range', `bytes */${m.length}`)
				return new Response(null, { status: 416, headers })
			}
			start = Math.max(0, m.length - suffix)
		} else {
			start = Number(parsed[1])
			if (parsed[2]) end = Math.min(end, Number(parsed[2]))
		}
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
			start >= m.length || end < start) {
			headers.set('content-range', `bytes */${m.length}`)
			return new Response(null, { status: 416, headers })
		}
		partial = true
		headers.set('content-range', `bytes ${start}-${end}/${m.length}`)
	}

	const length = Math.max(0, end - start + 1)
	headers.set('content-length', String(length))
	if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers })
	const first = Math.floor(start / ROOM_BLOB_CHUNK_BYTES)
	const last = Math.floor(Math.max(start, end) / ROOM_BLOB_CHUNK_BYTES)
	if (first < 0 || last >= m.parts) return null
	const out = new Uint8Array(length)
	let dest = 0
	for (let i = first; i <= last; i++) {
		const chunk = await kv.get(partKey(key, i), 'arrayBuffer')
		if (!chunk) return null
		const view = new Uint8Array(chunk)
		const from = Math.max(0, start - i * ROOM_BLOB_CHUNK_BYTES)
		const to = Math.min(view.length, end + 1 - i * ROOM_BLOB_CHUNK_BYTES)
		if (from > to || to < 0) return null
		out.set(view.subarray(from, to), dest)
		dest += to - from
	}
	if (dest !== length) return null
	return new Response(out, { status: partial ? 206 : 200, headers })
}
