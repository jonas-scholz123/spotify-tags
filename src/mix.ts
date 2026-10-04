import { MIX_NAME, rememberMixPlaylist } from './library'
import {
  createPrivatePlaylist,
  getDevices,
  playTracks,
  replacePlaylistTracks,
  setPlaylistDescription,
  SpotifyError,
  type Playlist,
} from './spotify'

const MAX_DESCRIPTION_LENGTH = 300

/** Overwrites the reusable output playlist with `uris`, creating it on first use. */
export async function saveMix(
  existing: Playlist | null,
  uris: string[],
  fullDescription: string,
): Promise<Playlist> {
  const description = fullDescription.slice(0, MAX_DESCRIPTION_LENGTH)
  let playlist = existing
  if (playlist) {
    await setPlaylistDescription(playlist.id, description)
  } else {
    playlist = await createPrivatePlaylist(MIX_NAME, description)
    rememberMixPlaylist(playlist.id)
  }
  await replacePlaylistTracks(playlist.id, uris)
  return playlist
}

export interface Playback {
  /** How many of the requested tracks Spotify accepted, counted from the start. */
  count: number
  /** Name of the device that was picked, or null if Spotify's active device was used. */
  device: string | null
}

/**
 * Starts playing these tracks on the active device, or on the first available one.
 *
 * The track list itself is sent rather than the output playlist: asking a player to play a
 * playlist it already has loaded makes it carry on with the contents it had before.
 */
export async function playMix(uris: string[]): Promise<Playback> {
  try {
    return { count: await playAsManyAsFit(uris), device: null }
  } catch (err) {
    // 404 means Spotify has no active device; a specific device has to be named instead.
    if (!(err instanceof SpotifyError) || err.status !== 404) throw err
  }
  const device = (await getDevices()).find((d) => d.id && !d.is_restricted)
  if (!device?.id) {
    throw new Error('No Spotify device found. Open Spotify on a device and try again.')
  }
  return { count: await playAsManyAsFit(uris, device.id), device: device.name }
}

// Spotify answers 413 to long track lists but documents no limit, so halve until it fits.
async function playAsManyAsFit(uris: string[], deviceId?: string): Promise<number> {
  for (let count = uris.length; ; count = Math.ceil(count / 2)) {
    try {
      await playTracks(uris.slice(0, count), deviceId)
      return count
    } catch (err) {
      if (!(err instanceof SpotifyError) || err.status !== 413 || count <= 1) throw err
    }
  }
}
