import { del, get, keys, set } from 'idb-keyval'
import type { Tag } from './filter'
import { getMe, getMyPlaylists, getPlaylistTracks, type Playlist, type Track } from './spotify'

export const MIX_NAME = 'Tag Mix'
const MIX_ID_KEY = 'spotify-tags:mix-id'
const CACHE_PREFIX = 'tag:'
const CONCURRENCY = 4

export interface Library {
  /** Every playlist the user owns, except the app's own output playlist. */
  tags: Tag[]
  tracks: Map<string, Track>
  /** The output playlist, if it already exists. */
  mixPlaylist: Playlist | null
}

interface CachedTag {
  snapshotId: string
  tracks: Track[]
}

export function rememberMixPlaylist(id: string): void {
  localStorage.setItem(MIX_ID_KEY, id)
}

export async function loadLibrary(
  onProgress: (done: number, total: number) => void,
): Promise<Library> {
  const [me, playlists] = await Promise.all([getMe(), getMyPlaylists()])
  const owned = playlists.filter((p) => p.owner.id === me.id)
  const mixId = localStorage.getItem(MIX_ID_KEY)
  const mixPlaylist =
    owned.find((p) => p.id === mixId) ?? owned.find((p) => p.name === MIX_NAME) ?? null
  const tagPlaylists = owned.filter((p) => p !== mixPlaylist)

  let done = 0
  onProgress(done, tagPlaylists.length)
  const trackLists = await mapPool(tagPlaylists, CONCURRENCY, async (playlist) => {
    const tracks = await loadTagTracks(playlist)
    onProgress(++done, tagPlaylists.length)
    return tracks
  })
  await dropStaleCache(tagPlaylists)

  const tracks = new Map<string, Track>()
  const tags = tagPlaylists.map((playlist, i): Tag => {
    for (const track of trackLists[i]) {
      if (!tracks.has(track.key)) tracks.set(track.key, track)
    }
    return {
      id: playlist.id,
      name: playlist.name,
      trackKeys: new Set(trackLists[i].map((t) => t.key)),
    }
  })
  tags.sort((a, b) => a.name.localeCompare(b.name))
  return { tags, tracks, mixPlaylist }
}

// A playlist's snapshot_id changes whenever its contents do, so unchanged playlists cost no requests.
async function loadTagTracks(playlist: Playlist): Promise<Track[]> {
  const cacheKey = CACHE_PREFIX + playlist.id
  const cached = await get<CachedTag>(cacheKey)
  if (cached?.snapshotId === playlist.snapshot_id) return cached.tracks
  const tracks = await getPlaylistTracks(playlist.id)
  await set(cacheKey, { snapshotId: playlist.snapshot_id, tracks } satisfies CachedTag)
  return tracks
}

async function dropStaleCache(current: Playlist[]): Promise<void> {
  const live = new Set(current.map((p) => CACHE_PREFIX + p.id))
  const stale = (await keys()).filter((key) => typeof key === 'string' && !live.has(key))
  await Promise.all(stale.map((key) => del(key)))
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
