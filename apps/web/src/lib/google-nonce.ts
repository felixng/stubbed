// A random, URL-safe value: the `state` that ties Google's sign-in popup to
// the tap that opened it (GoogleButton).
export function randomNonce(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
