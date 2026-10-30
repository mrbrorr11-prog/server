/**
 * Read the room name from an old Rec Room share link.
 *
 * Official rec.net and the recroom.network community port both provide a room
 * name in their /room/<name> URLs, not a playable scene export. Never fetch remote
 * content from these URLs — the caller supplies an authorized scene file.
 */
export function roomNameFromRecNetLink(value: string): string | null {
	const text = value.trim()
	if (!text) return null

	let url: URL
	try {
		url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
	} catch {
		return null
	}

	if (!['rec.net', 'www.rec.net', 'recroom.network', 'www.recroom.network'].includes(url.hostname.toLowerCase())) return null
	if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) return null

	const match = /^\/room\/([^/]+)\/?$/i.exec(url.pathname)
	if (!match) return null

	try {
		const name = decodeURIComponent(match[1]).replace(/^\^/, '').trim()
		// The link's URL path must contain one ordinary room-name segment.
		if (!name || name.length > 80 || name.includes('/') || name.includes('\\')) return null
		return name
	} catch {
		return null
	}
}
