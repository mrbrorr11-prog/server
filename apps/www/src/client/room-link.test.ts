import { describe, expect, it } from 'vitest'

import { roomNameFromRecNetLink } from './room-link'

describe('Rec Room share links', () => {
	it.each([
		['https://rec.net/room/MyRoom', 'MyRoom'],
		['rec.net/room/PortalTemplate_Clean', 'PortalTemplate_Clean'],
		['https://www.rec.net/room/Room.Name/?utm_source=share#details', 'Room.Name'],
		['http://rec.net/room/%5EAnotherRoom', 'AnotherRoom'],
	])('reads a room name from %s', (link, expected) => {
		expect(roomNameFromRecNetLink(link)).toBe(expected)
	})

	it.each([
		'',
		'https://rec.net/user/Coach',
		'https://rec.net/room/',
		'https://rec.net/room/One/Two',
		'https://rec.net.evil.example/room/MyRoom',
		'https://other.example/room/MyRoom',
		'https://rec.net@evil.example/room/MyRoom',
		'https://rec.net/room/%2F',
		'https://rec.net/room/%ZZ',
		'javascript:alert(1)',
	])('rejects unsupported or invalid link %s', (link) => {
		expect(roomNameFromRecNetLink(link)).toBeNull()
	})
})
