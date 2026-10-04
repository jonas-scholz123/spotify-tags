# Spotify Tags

Treat your Spotify playlists as tags. Pick any combination ("chill" + "banger" + "vocal") and
play the songs that have all of them, without making a playlist per combination.

- Every playlist you own is a tag. Tag a song by adding it to those playlists in Spotify.
- The app writes the result to one reusable private playlist called **Tag Mix** and can start
  playing it. An existing playlist you own with that exact name will be overwritten.
- Everything runs in your browser; there is no backend.

## Setup

Requires a Spotify Premium account (Spotify requires it for Development Mode apps and for
playback control).

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app
   with the **Web API** enabled.
2. Add this redirect URI exactly, including the trailing slash: `http://127.0.0.1:5173/`
   (Spotify does not accept `localhost`).
3. Copy `.env.local.example` to `.env.local` and paste the app's Client ID after
   `VITE_SPOTIFY_CLIENT_ID=`.
4. Install and run:

   ```bash
   npm install
   ```

   ```bash
   npm run dev
   ```

5. Open http://127.0.0.1:5173 and log in.

## Use

- Click tags to select them. The list shows the songs that have every selected tag.
- The number on an unselected tag is how many songs would remain if you added it.
- **Play mix** overwrites Tag Mix and starts playing those songs on your active Spotify device
  (or the first available one). **Save only** just overwrites the playlist.
- **Refresh** picks up playlist changes. Only playlists that changed are downloaded again.

## Hosting

The app is static files, so any static host works. The redirect URI is always the address the
app is served from, with a trailing slash, and has to be added in the Spotify dashboard.

This repo deploys to GitHub Pages on every push to `main` (see
`.github/workflows/deploy.yml`). To use that in a fork:

1. Set the repository variable `VITE_SPOTIFY_CLIENT_ID` to your app's Client ID
   (Settings > Secrets and variables > Actions > Variables). It is not a secret; it ends up in
   the page's code.
2. Set Settings > Pages > Source to **GitHub Actions**.
3. Add `https://<user>.github.io/<repo>/` as a redirect URI in the Spotify dashboard.
4. Add every other person who should be able to log in under User Management in the Spotify
   dashboard.

## Notes

- Playlists you follow but don't own can't be tags: Spotify only returns contents for playlists
  you own or collaborate on.
- Songs are matched by ISRC when Spotify provides it, so the album and single versions of a
  recording count as the same song. Local files and podcast episodes are ignored.
- A Development Mode app is limited to five Spotify users.

## Scripts

- `npm run dev` starts the app on http://127.0.0.1:5173
- `npm run test` runs the filter logic tests
- `npm run build` typechecks and builds
