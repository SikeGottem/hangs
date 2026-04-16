// Minimal ambient types for Google Identity Services (GIS) token model —
// window.google.accounts.oauth2. Used by components/GoogleCalendarSync.tsx.
// The full GIS library has dozens of methods; we only need the ones we call.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string; scope?: string }) => void
            error_callback?: (err: { type: string; message?: string }) => void
          }): { requestAccessToken(overrides?: { prompt?: string }): void }
          hasGrantedAllScopes(resp: unknown, ...scopes: string[]): boolean
        }
      }
    }
  }
}

export {}
