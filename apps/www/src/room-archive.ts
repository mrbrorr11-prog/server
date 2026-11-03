import { roomNameFromRecNetLink } from './client/room-link'

/**
 * Public, verified description only. A Rec Room web page is not a scene-data endpoint:
 * this deliberately does NOT try to copy Unity assets, circuits or gameplay files.
 *
 * Never fetch a caller-supplied URL directly. A hard-coded https URL, derived from
 * the allowlisted hostname and a single encoded room-name segment, avoids SSRF.
 */
export async function fetchPublicRoomDescription(sourceLink: string, expectedName: string): Promise<string> {
	const parsedName = roomNameFromRecNetLink(sourceLink)
	if (!parsedName || parsedName.toLowerCase() !== expectedName.toLowerCase()) {
		throw new Error('Paste a valid rec.net or recroom.network link matching the room name.')
	}
	const input = new URL(/^https?:\/\//i.test(sourceLink.trim()) ? sourceLink.trim() : `https://${sourceLink.trim()}`)
	const host = input.hostname.toLowerCase()
	const url = `https://${host}/room/${encodeURIComponent(parsedName)}`
	let response: Response
	try {
		response = await fetch(url, {
			method: 'GET',
			redirect: 'manual',
			headers: { Accept: 'text/html' },
			signal: AbortSignal.timeout(8000),
		})
	} catch {
		throw new Error('The linked room page is currently unreachable. No room was created.')
	}
	if (!response.ok || response.status >= 300) {
		throw new Error('The linked room page did not provide public room details. No room was created.')
	}
	if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
		throw new Error('The link did not return a public room page. No room was created.')
	}
	if (Number(response.headers.get('content-length') ?? 0) > 512_000) {
		throw new Error('The room page was too large to read safely. No room was created.')
	}
	const html = await response.text()
	if (html.length > 512_000) {
		throw new Error('The room page was too large to read safely. No room was created.')
	}
	const unescape = (value: string): string =>
		value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
			.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim()
	const metaValue = (wanted: string): string => {
		for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
			const attrs = Array.from(match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
			const values = Object.fromEntries(attrs.map((a) => [a[1].toLowerCase(), a[2] ?? a[3] ?? '']))
			if ((values.property ?? values.name)?.toLowerCase() === wanted) return unescape(values.content ?? '')
		}
		return ''
	}
	const rawTitle = metaValue('og:title') ||
		unescape(/<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '')
	// A generic site's home page, 404 SPA shell, or a login wall must not create
	// a room using a name that was only present in the *input* URL.
	if (!rawTitle.toLowerCase().includes(expectedName.toLowerCase())) {
		throw new Error('The source did not expose a verifiable room page. No room was created.')
	}
	return (metaValue('og:description') || metaValue('description')).slice(0, 1000)
}
