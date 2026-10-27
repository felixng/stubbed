// The nonce for Google ID-token sign-in (#179, and the iOS app's Apple and
// Google sign-in): Google gets the SHA-256 of a random value and puts it in
// the ID token; Supabase gets the raw value, hashes it and checks they
// match, so a token can't be replayed in another sign-in.

export function randomNonce(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
