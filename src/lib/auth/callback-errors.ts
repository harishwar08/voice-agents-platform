/** Why /auth/callback sent the person back here, keyed by its ?error= code. */
const callbackErrors: Record<string, string> = {
  no_account: "There is no account for that Google address. Ask your account manager to set one up, or log in with your email and password.",
  google_cancelled: "Google sign-in was cancelled.",
  link_expired: "That sign-in link has expired. Try again.",
  link_invalid: "That sign-in link is not valid. Try again.",
  not_configured: "Sign-in is not set up on this server.",
};

/** The message for the login page's ?error= code, or null when there is none. */
export function loginErrorMessage(code: string | string[] | undefined): string | null {
  if (typeof code !== "string") return null;
  return callbackErrors[code] ?? "Sign-in failed. Try again.";
}
