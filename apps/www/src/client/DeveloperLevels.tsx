import { useState } from 'react'
import { accountByUsername, call, isDeveloper, useAction, where } from './api'

import type { FormEvent } from 'react'
import type { PublicAccount } from './api'

type LevelRecord = { playerId: number; level: number; xp: number; maxLevel: number }

/**
 * Developer-only level editor. Account search uses the same accounts worker as
 * the public player search, while the write uses a signed developer-only www API.
 */
export function DeveloperLevelsPage({ signedIn }: { signedIn: boolean | undefined }) {
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<PublicAccount[]>([])
	const [searched, setSearched] = useState(false)
	const [selected, setSelected] = useState<PublicAccount | null>(null)
	const [progression, setProgression] = useState<LevelRecord | null>(null)
	const [targetLevel, setTargetLevel] = useState('')
	const searchAction = useAction()
	const selectAction = useAction()
	const saveAction = useAction()

	if (signedIn === undefined) return <main className="shell wide"><p>Checking session…</p></main>
	if (!signedIn) return <main className="shell wide"><h1>Developer · Player levels</h1><p>Sign in to use developer tools.</p></main>
	// UI gate is just cosmetic: the API independently verifies the signed JWT's
	// developer role for both reading and changing a level.
	if (!isDeveloper()) return <main className="shell wide"><h1>Developer · Player levels</h1><p className="error">Developer access required.</p></main>

	const search = (event: FormEvent) => {
		event.preventDefault()
		setSelected(null)
		setProgression(null)
		setResults([])
		setSearched(false)
		void searchAction.run(async () => {
			const name = query.trim().replace(/^@/, '')
			if (!name) throw new Error('Enter a player username.')
			const matches = await call<PublicAccount[]>(
				`${where().accounts}/account/search?name=${encodeURIComponent(name)}&take=20`
			)
			// Include an exact-match result even when a prefix search is incomplete.
			const exact = await accountByUsername(name)
			const combined = [...(exact ? [exact] : []), ...matches]
			setResults(combined.filter((player, i) =>
				combined.findIndex((found) => found.accountId === player.accountId) === i
			))
			setSearched(true)
			return ''
		})
	}

	const choose = (player: PublicAccount) => {
		setSelected(player)
		setProgression(null)
		setTargetLevel('')
		void selectAction.run(async () => {
			const record = await call<LevelRecord>(`/api/staff/players/${player.accountId}/level`, {
				authed: true,
			})
			setProgression(record)
			setTargetLevel(String(record.level))
			return ''
		})
	}

	const save = (event: FormEvent) => {
		event.preventDefault()
		if (!selected || !progression) return
		void saveAction.run(async () => {
			const level = Number(targetLevel)
			if (!Number.isSafeInteger(level) || level < 1 || level > progression.maxLevel)
				throw new Error(`Choose a whole level between 1 and ${progression.maxLevel}.`)
			const saved = await call<{ level: number; xp: number }>(
				`/api/staff/players/${selected.accountId}/level`, {
					authed: true,
					json: { level },
				}
			)
			setProgression({ ...progression, level: saved.level, xp: saved.xp })
			setTargetLevel(String(saved.level))
			return `Saved @${selected.username} at level ${saved.level}. XP reset to ${saved.xp}.`
		})
	}

	return (
		<main className="shell wide">
			<h1>Developer · Player levels</h1>
			<p className="muted">Search for a player, then set their exact level. The game supports levels 1–50.</p>
			<section className="card">
				<h2>Find player</h2>
				<form onSubmit={search}>
					<label htmlFor="dev-player-query">Username</label>
					<div className="staff-gift">
						<input
							id="dev-player-query"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search by username"
							autoComplete="off"
							required
						/>
						<button type="submit" disabled={searchAction.pending}>
							{searchAction.pending ? 'Searching…' : 'Search'}
						</button>
					</div>
				</form>
				{searchAction.error && <p className="error" role="alert">{searchAction.error}</p>}
				{searched && results.length === 0 && <p className="muted">No players found.</p>}
				{results.length > 0 && (
					<ul className="developer-level-results">
						{results.map((player) => (
							<li key={player.accountId}>
								<span><strong>{player.displayName || player.username}</strong><br /><span className="muted">@{player.username} · ID {player.accountId}</span></span>
								<button type="button" onClick={() => choose(player)} disabled={selectAction.pending}>
									{selected?.accountId === player.accountId ? 'Selected' : 'Manage'}
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
			{selected && (
				<section className="card" aria-live="polite">
					<h2>Set @{selected.username}&apos;s level</h2>
					{selectAction.error && <p role="alert" className="error">{selectAction.error}</p>}
					{selectAction.pending && <p className="muted">Loading level…</p>}
					{progression && (
						<>
							<p>Current level: <strong>{progression.level}</strong> · XP: {progression.xp}</p>
							<form onSubmit={save}>
								<label htmlFor="developer-level-input">New level (1–{progression.maxLevel})</label>
								<div className="staff-gift">
									<input
										id="developer-level-input"
										type="number"
										inputMode="numeric"
										step="1"
										min="1"
										max={progression.maxLevel}
										value={targetLevel}
										onChange={(event) => setTargetLevel(event.target.value)}
										required
									/>
									<button type="submit" disabled={saveAction.pending}>
										{saveAction.pending ? 'Saving…' : 'Save level'}
									</button>
								</div>
								<span className="hint">
									Updates the saved in-game level immediately. Resets XP towards the next level to 0.
									No level-up rewards are granted.
								</span>
							</form>
						</>
					)}
					{saveAction.error && <p className="error" role="alert">{saveAction.error}</p>}
					{saveAction.done && <p className="ok" role="status">{saveAction.done}</p>}
				</section>
			)}
		</main>
	)
}
