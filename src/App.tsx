import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasClientId, isLoggedIn, LoggedOutError, login, logout, redirectUri } from './auth'
import { describeSelection, facetCounts, matchTracks, type Tag } from './filter'
import { loadLibrary, MIX_NAME, type Library } from './library'
import { playMix, saveMix } from './mix'

const NO_TAGS: Tag[] = []

const songCount = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`

export function App({ loginError }: { loginError: string | null }) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn)

  if (!hasClientId) return <Setup />
  if (!loggedIn) return <Login error={loginError} />
  return (
    <Mixer
      onLoggedOut={() => {
        logout()
        setLoggedIn(false)
      }}
    />
  )
}

function Setup() {
  return (
    <main className="centered">
      <h1>Spotify Tags</h1>
      <p>One-time setup:</p>
      <ol>
        <li>
          Create an app in the{' '}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            Spotify Developer Dashboard
          </a>{' '}
          with the Web API enabled.
        </li>
        <li>
          Add <code>{redirectUri}</code> as a redirect URI.
        </li>
        <li>
          Copy <code>.env.local.example</code> to <code>.env.local</code>, paste the app’s Client ID
          after <code>VITE_SPOTIFY_CLIENT_ID=</code>, and restart the dev server.
        </li>
      </ol>
    </main>
  )
}

function Login({ error }: { error: string | null }) {
  return (
    <main className="centered">
      <h1>Spotify Tags</h1>
      <p>Treat your playlists as tags and play the songs that have all of the ones you pick.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" onClick={() => void login()}>
        Log in with Spotify
      </button>
    </main>
  )
}

function Mixer({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [library, setLibrary] = useState<Library | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'save' | 'play' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof LoggedOutError) onLoggedOut()
      else setError(err instanceof Error ? err.message : String(err))
    },
    [onLoggedOut],
  )

  const load = useCallback(async () => {
    setError(null)
    setNotice(null)
    setProgress({ done: 0, total: 0 })
    try {
      const loaded = await loadLibrary((done, total) => setProgress({ done, total }))
      setLibrary(loaded)
      // Drop selected tags whose playlists no longer exist.
      const ids = new Set(loaded.tags.map((t) => t.id))
      setSelection((prev) => new Set([...prev].filter((id) => ids.has(id))))
    } catch (err) {
      fail(err)
    } finally {
      setProgress(null)
    }
  }, [fail])

  // Load once on mount; later loads come from the Refresh button.
  useEffect(() => {
    void load()
  }, [])

  const tags = library?.tags ?? NO_TAGS
  const matches = useMemo(() => matchTracks(tags, selection), [tags, selection])
  const counts = useMemo(() => facetCounts(tags, selection), [tags, selection])

  function toggle(tag: Tag) {
    setNotice(null)
    setSelection((prev) => {
      const next = new Set(prev)
      if (!next.delete(tag.id)) next.add(tag.id)
      return next
    })
  }

  async function run(action: 'save' | 'play') {
    if (!library) return
    setBusy(action)
    setError(null)
    setNotice(null)
    try {
      const uris = matches.map((key) => library.tracks.get(key)!.uri)
      const playlist = await saveMix(library.mixPlaylist, uris, describeSelection(tags, selection))
      setLibrary((current) => current && { ...current, mixPlaylist: playlist })
      const songs = songCount(uris.length)
      if (action === 'play') {
        const { count, device } = await playMix(uris)
        const where = device ? ` on ${device}` : ''
        setNotice(
          count < uris.length
            ? `Playing the first ${count} of ${songs}${where}. The full mix is in “${MIX_NAME}”.`
            : `Playing ${songs}${where}.`,
        )
      } else {
        setNotice(`Saved ${songs} to “${MIX_NAME}”.`)
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main>
      <header>
        <h1>Spotify Tags</h1>
        <div className="actions">
          <button onClick={() => void load()} disabled={progress !== null}>
            Refresh
          </button>
          <button onClick={onLoggedOut}>Log out</button>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <p role="status">
          Loading playlists… {progress.done}/{progress.total}
        </p>
      )}

      {library && tags.length === 0 && (
        <p>You don’t own any playlists yet. Create one in Spotify, then refresh.</p>
      )}

      {library && tags.length > 0 && (
        <>
          <section aria-label="Tags">
            <p className="hint">Select tags to see the songs that have all of them.</p>
            <div className="chips">
              {tags.map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  selected={selection.has(tag.id)}
                  remaining={counts.get(tag.id) ?? 0}
                  onClick={() => toggle(tag)}
                />
              ))}
            </div>
          </section>

          <section aria-label="Matching songs">
            <div className="result-bar">
              <p className="summary">
                <strong>{songCount(matches.length)}</strong>
                {selection.size > 0 && <span> · {describeSelection(tags, selection)}</span>}
              </p>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => void run('play')}
                  disabled={matches.length === 0 || busy !== null}
                >
                  {busy === 'play' ? 'Starting…' : 'Play mix'}
                </button>
                <button
                  onClick={() => void run('save')}
                  disabled={matches.length === 0 || busy !== null}
                >
                  {busy === 'save' ? 'Saving…' : 'Save only'}
                </button>
                <button onClick={() => setSelection(new Set())} disabled={selection.size === 0}>
                  Clear
                </button>
              </div>
            </div>

            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            {selection.size > 0 && matches.length === 0 && (
              <p className="hint">No songs have all of these tags.</p>
            )}

            <ol className="tracks">
              {matches.map((key) => {
                const track = library.tracks.get(key)!
                return (
                  <li key={key}>
                    {track.image ? <img src={track.image} alt="" /> : <span className="no-art" />}
                    <span className="track-text">
                      <span className="track-name">{track.name}</span>
                      <span className="track-meta">
                        {track.artists.join(', ')}
                        {track.album && ` · ${track.album}`}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}
    </main>
  )
}

function TagChip(props: {
  tag: Tag
  selected: boolean
  /** Songs left if this tag were added to the current selection. */
  remaining: number
  onClick: () => void
}) {
  const { tag, selected, remaining, onClick } = props
  const count = selected ? tag.trackKeys.size : remaining
  return (
    <button
      className={`chip${selected ? ' selected' : ''}${!selected && remaining === 0 ? ' empty' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${tag.name}, ${songCount(count)}`}
    >
      {tag.name}
      <span className="count">{count}</span>
    </button>
  )
}
