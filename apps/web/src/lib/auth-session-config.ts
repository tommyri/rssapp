/** Keep server session records aligned with Auth.js's JWT lifetime. */
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_SESSION_MAX_AGE_MS = AUTH_SESSION_MAX_AGE_SECONDS * 1_000;
