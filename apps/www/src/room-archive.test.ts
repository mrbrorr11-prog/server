import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchPublicRoomDescription } from './room-archive'

afterEach(() => vi.unstubAllGlobals())

describe('safe public room metadata import', () => {
	it('reads a verified title and description from an allowlisted room page', async () => {
		const fakeFetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(
			'<html><head><title>^IgnitedBonnie - Rec Room</title>' +
			'<meta property="og:description" content="An authorized public room archive."></head></html>',
			{ status: 200, headers: { 'content-type': 'text/html' } }
		))
		vi.stubGlobal('fetch', fakeFetch)
		expect(await fetchPublicRoomDescription(
			'https://recroom.network/room/IgnitedBonnie',
			'IgnitedBonnie'
		)).toBe('An authorized public room archive.')
		expect(fakeFetch).toHaveBeenCalledTimes(1)
		expect(fakeFetch.mock.calls[0]?.[0]).toBe('https://recroom.network/room/IgnitedBonnie')
	})

	it('refuses a generic homepage response instead of creating an empty room', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(
			'<title>Rec Room</title>', { headers: { 'content-type': 'text/html' } }
		)))
		await expect(fetchPublicRoomDescription(
			'https://recroom.network/room/IgnitedBonnie', 'IgnitedBonnie'
		)).rejects.toThrow(/verifiable/)
	})

	it('refuses a mismatched or untrusted link without requesting it', async () => {
		const fakeFetch = vi.fn()
		vi.stubGlobal('fetch', fakeFetch)
		await expect(fetchPublicRoomDescription(
			'https://recroom.network.evil.example/room/IgnitedBonnie', 'IgnitedBonnie'
		)).rejects.toThrow(/valid/)
		await expect(fetchPublicRoomDescription(
			'https://recroom.network/room/SomeoneElse', 'IgnitedBonnie'
		)).rejects.toThrow(/matching/)
		expect(fakeFetch).not.toHaveBeenCalled()
	})
})
