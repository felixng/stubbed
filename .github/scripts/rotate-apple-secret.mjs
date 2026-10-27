// Makes a new Sign in with Apple client secret and saves it in the hosted
// Supabase project. Apple caps the secret at 6 months, and hosted Supabase
// only takes the finished secret (not the .p8 key), so this runs monthly from
// .github/workflows/rotate-apple-secret.yml. No dependencies: Node's crypto
// signs the ES256 JWT.
//
// Env: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID, APPLE_PRIVATE_KEY (the
// .p8 file's contents), SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN.

import { createPrivateKey, sign } from "node:crypto";
import { pathToFileURL } from "node:url";

// Apple refuses secrets that last longer than 15,777,000 s (about 182 days).
const LIFETIME_SECONDS = 180 * 24 * 60 * 60;

const base64url = (input) => Buffer.from(input).toString("base64url");

export function appleClientSecret({ teamId, keyId, servicesId, privateKey, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat,
      exp: iat + LIFETIME_SECONDS,
      aud: "https://appleid.apple.com",
      sub: servicesId,
    }),
  );
  // JWTs want the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return { secret: `${header}.${payload}.${base64url(signature)}`, expiresAt: new Date((iat + LIFETIME_SECONDS) * 1000) };
}

// Asks Apple to redeem a made-up code. A good secret gets "invalid_grant" (the
// code is wrong); a bad one gets "invalid_client". Runs before anything is
// saved, so a broken key never replaces a working secret.
async function checkWithApple(servicesId, secret) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: servicesId,
      client_secret: secret,
      grant_type: "authorization_code",
      code: "rotate-apple-secret-check",
    }),
  });
  const { error } = await response.json().catch(() => ({}));
  if (error !== "invalid_grant") {
    throw new Error(`Apple rejected the new secret (${response.status} ${error ?? "no error code"}). Check the Team ID, Key ID, Services ID and .p8 key.`);
  }
}

async function saveToSupabase(projectRef, accessToken, secret) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ external_apple_secret: secret }),
  });
  if (!response.ok) {
    throw new Error(`Supabase didn't save the secret (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

// Supabase's authorize endpoint sends the browser on to Apple once the
// provider has a secret, and answers 400 "missing OAuth secret" without one.
// The new config can take a moment to apply, so this retries for a minute.
async function checkSignInStarts(projectRef) {
  const url = `https://${projectRef}.supabase.co/auth/v1/authorize?provider=apple`;
  let last = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(url, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    if (response.status >= 300 && response.status < 400 && location.startsWith("https://appleid.apple.com/")) return;
    last = `${response.status} ${location || (await response.text()).slice(0, 200)}`;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Saved, but Apple sign-in still doesn't start: ${last}`);
}

async function main() {
  const env = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} isn't set.`);
    return value;
  };
  const servicesId = env("APPLE_SERVICES_ID");
  const projectRef = env("SUPABASE_PROJECT_REF");
  const { secret, expiresAt } = appleClientSecret({
    teamId: env("APPLE_TEAM_ID"),
    keyId: env("APPLE_KEY_ID"),
    servicesId,
    privateKey: env("APPLE_PRIVATE_KEY"),
  });

  await checkWithApple(servicesId, secret);
  console.log("Apple accepts the new secret.");
  await saveToSupabase(projectRef, env("SUPABASE_ACCESS_TOKEN"), secret);
  console.log("Saved in Supabase.");
  await checkSignInStarts(projectRef);
  console.log(`Apple sign-in starts. The new secret expires ${expiresAt.toISOString().slice(0, 10)}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
