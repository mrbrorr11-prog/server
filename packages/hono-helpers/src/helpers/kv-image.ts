/**
 * Saved photos on a free Workers deployment without R2.
 *
 * Uses the same free KV namespace already configured for room saves, but a
 * separate prefix. These keys never conflict with the room-blob manifests.
 * Only server-generated keys should be passed to putKvImage; uploads are
 * authenticated by the API/storage workers.
 */
export const KV_IMAGE_MAX_BYTES = 16 * 1024 * 1024

type ImageMetadata = {
	contentType: 'image/jpeg' | 'image/png'
	etag: string
}

function imageKey(name: string): string {
	if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) {
		throw new Error('Invalid image key')
	}
	return `recflare-photo:${name}`
}

export async function putKvImage(
	kv: KVNamespace,
	name: string,
	bytes: Uint8Array,
	contentType: ImageMetadata['contentType']
): Promise<void> {
	if (bytes.byteLength > KV_IMAGE_MAX_BYTES)
		throw new RangeError('Photo exceeds the free-storage limit (16 MiB)')
	const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
	const etag = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
	await kv.put(imageKey(name), bytes, { metadata: { contentType, etag } satisfies ImageMetadata })
}

export async function getKvImage(
	kv: KVNamespace | undefined,
	name: string
): Promise<{ bytes: ArrayBuffer; contentType: ImageMetadata['contentType']; etag: string } | null> {
	if (!kv || !name || name.includes('..') || name.startsWith('/') || name.includes('\\')) return null
	const stored = await kv.getWithMetadata<ImageMetadata>(imageKey(name), 'arrayBuffer')
	if (!stored.value || !stored.metadata) return null
	if (stored.metadata.contentType !== 'image/jpeg' && stored.metadata.contentType !== 'image/png')
		return null
	return { bytes: stored.value, contentType: stored.metadata.contentType, etag: stored.metadata.etag }
}

export async function deleteKvImage(kv: KVNamespace | undefined, name: string): Promise<void> {
	if (!kv || !name || name.includes('..') || name.startsWith('/') || name.includes('\\')) return
	await kv.delete(imageKey(name))
}
