// Thin client for the Spotify Web API routes this app needs, using the post-February-2026
// playlist routes (`/items`, not `/tracks`).

import { getAccessToken } from './auth'

const API = 'https://api.spotify.com/v1'
const MAX_RATE_LIMIT_RETRIES = 5
const WRITE_BATCH = 100

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface Me {
  id: string
  display_name: string | null
}

export interface Playlist {
  id: string
  name: string
  uri: string
  snapshot_id: string
  owner: { id: string }
}

export interface Track {
  /** Identity used for intersecting: ISRC when Spotify provides it, else the track id. */
  key: string
  uri: string
  name: string
  artists: string[]
  album: string
  image: string | null
}

export interface Device {
  id: string | null
  name: string
  is_active: boolean
  is_restricted: boolean
}

interface Page<T> {
  items: T[]
  next: string | null
}

interface RawTrack {
  id: string | null
  uri: string
  name: string
  type: string
  is_local?: boolean
  artists?: { name: string }[]
  album?: { name: string; images?: { url: string }[] }
  external_ids?: { isrc?: string }
}

// The February 2026 migration renamed `track` to `item`; accept either.
interface RawPlaylistItem {
  item?: RawTrack | null
  track?: RawTrack | null
}

async function request<T>(method: string, pathOrUrl: string, body?: unknown): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : API + pathOrUrl
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(refreshed)
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401 && !refreshed) {
      refreshed = true
      continue
    }
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Retry-After is not always readable cross-origin, so fall back to exponential backoff.
      const seconds = Number(res.headers.get('Retry-After')) || 2 ** attempt
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      continue
    }
    const text = await res.text()
    const json = parseJson(text)
    if (!res.ok) {
      const message = json?.error?.message || text || res.statusText
      throw new SpotifyError(res.status, `Spotify ${method} ${res.status}: ${message}`)
    }
    return json as T
  }
}

// Player routes answer with empty or non-JSON bodies on success.
function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function paginate<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let url: string | null = path
  while (url) {
    const page: Page<T> = await request('GET', url)
    out.push(...page.items)
    url = page.next
  }
  return out
}

export function getMe(): Promise<Me> {
  return request('GET', '/me')
}

export async function getMyPlaylists(): Promise<Playlist[]> {
  const playlists = await paginate<Playlist | null>('/me/playlists?limit=50')
  return playlists.filter((p): p is Playlist => p !== null)
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const items = await paginate<RawPlaylistItem>(`/playlists/${playlistId}/items?limit=50`)
  const tracks: Track[] = []
  for (const entry of items) {
    const raw = entry.item ?? entry.track
    // Episodes, local files and removed tracks can't be matched or written back reliably.
    if (!raw || raw.type !== 'track' || raw.is_local || !raw.id) continue
    tracks.push({
      key: raw.external_ids?.isrc ?? raw.id,
      uri: raw.uri,
      name: raw.name,
      artists: (raw.artists ?? []).map((a) => a.name),
      album: raw.album?.name ?? '',
      image: raw.album?.images?.at(-1)?.url ?? null,
    })
  }
  return tracks
}

export function createPrivatePlaylist(name: string, description: string): Promise<Playlist> {
  return request('POST', '/me/playlists', { name, description, public: false })
}

export function setPlaylistDescription(playlistId: string, description: string): Promise<void> {
  return request('PUT', `/playlists/${playlistId}`, { description })
}

export async function replacePlaylistTracks(playlistId: string, uris: string[]): Promise<void> {
  await request('PUT', `/playlists/${playlistId}/items`, { uris: uris.slice(0, WRITE_BATCH) })
  for (let i = WRITE_BATCH; i < uris.length; i += WRITE_BATCH) {
    await request('POST', `/playlists/${playlistId}/items`, { uris: uris.slice(i, i + WRITE_BATCH) })
  }
}

export async function getDevices(): Promise<Device[]> {
  const { devices } = await request<{ devices: Device[] }>('GET', '/me/player/devices')
  return devices
}

export function playTracks(uris: string[], deviceId?: string): Promise<void> {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''
  return request('PUT', `/me/player/play${query}`, { uris })
}
