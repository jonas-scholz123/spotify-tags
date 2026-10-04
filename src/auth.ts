// Authorization Code with PKCE: no client secret, tokens stay in this browser.

const CLIENT_ID: string | undefined = import.meta.env.VITE_SPOTIFY_CLIENT_ID
// The page's own directory URL, so one build works at a domain root and under a sub-path such
// as GitHub Pages' /<repo>/. It has to be registered exactly in the Spotify dashboard.
const REDIRECT_URI = new URL('.', location.href).href
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'user-read-playback-state',
  'user-modify-playback-state',
]

const TOKEN_KEY = 'spotify-tags:token'
const VERIFIER_KEY = 'spotify-tags:verifier'
const STATE_KEY = 'spotify-tags:state'

interface Token {
  access: string
  refresh: string
  expiresAt: number
}

export class LoggedOutError extends Error {
  constructor() {
    super('Not logged in to Spotify')
  }
}

export const hasClientId = Boolean(CLIENT_ID)
export const redirectUri = REDIRECT_URI

export function isLoggedIn(): boolean {
  return readToken() !== null
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function login(): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(16)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: base64url(new Uint8Array(digest)),
    state,
  })
  location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

/** Finishes the login if Spotify redirected back here with a result. Call once, before rendering. */
export async function completeLoginIfRedirected(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const state = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  history.replaceState(null, '', location.pathname)

  if (error) throw new Error(`Spotify login failed: ${error}`)
  if (!code || !verifier || params.get('state') !== state) {
    throw new Error('Spotify login response did not match the request. Try logging in again.')
  }
  await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })
}

let refreshing: Promise<Token> | null = null

export async function getAccessToken(forceRefresh = false): Promise<string> {
  const token = readToken()
  if (!token) throw new LoggedOutError()
  if (!forceRefresh && Date.now() < token.expiresAt - 60_000) return token.access
  // Concurrent requests share one refresh; Spotify rotates the refresh token on use.
  refreshing ??= requestToken({
    grant_type: 'refresh_token',
    refresh_token: token.refresh,
  }).finally(() => {
    refreshing = null
  })
  return (await refreshing).access
}

async function requestToken(body: Record<string, string>): Promise<Token> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID ?? '', ...body }),
  })
  if (!res.ok) {
    // 400 on refresh means the refresh token was revoked or expired; anything else may be transient.
    if (body.grant_type === 'refresh_token' && res.status === 400) {
      logout()
      throw new LoggedOutError()
    }
    throw new Error(`Spotify token request failed (${res.status})`)
  }
  const json = await res.json()
  const token: Token = {
    access: json.access_token,
    refresh: json.refresh_token ?? body.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  return token
}

function readToken(): Token | null {
  const raw = localStorage.getItem(TOKEN_KEY)
  return raw ? (JSON.parse(raw) as Token) : null
}

function randomString(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
