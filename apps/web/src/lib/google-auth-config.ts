export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Google is deliberately optional for self-hosted deployments. Supplying only
 * one half of the pair does not leave a broken sign-in control in the UI.
 */
export function googleOAuthCredentials(
  env: Record<string, string | undefined> = process.env,
): GoogleOAuthCredentials | null {
  const clientId = env.AUTH_GOOGLE_ID?.trim();
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleAuthEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return googleOAuthCredentials(env) !== null;
}

export function googleAuthNotice(
  value: string | undefined,
): string | undefined {
  switch (value) {
    case "unavailable":
      return "Google sign-in is not configured for this reader.";
    case "email-unverified":
      return "Choose a Google account with a verified email address.";
    case "account-unavailable":
      return "That Google sign-in is not available for this account.";
    case "link-required":
      return "This email already has an rssapp account. Sign in with your password, then connect Google from Settings.";
    case "account-not-found":
      return "No rssapp account is connected to that Google account yet. Create one with Google below.";
    case "registration-closed":
      return "This reader is not accepting new accounts right now.";
    case "invite-required":
      return "An active invitation is required to create an account with Google.";
    case "rate-limited":
      return "Too many account requests from this network. Please try again shortly.";
    default:
      return undefined;
  }
}

export function googleAccountSettingsNotice(
  value: string | undefined,
): string | undefined {
  switch (value) {
    case "connected":
      return "Google is now connected to this account.";
    case "already-connected":
      return "That Google account is already connected to a different rssapp account.";
    case "link-expired":
      return "Your Google connection request expired. Please try again.";
    default:
      return undefined;
  }
}
