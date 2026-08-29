// Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) sender for Deno.
// No npm dependency: uses WebCrypto for ECDH, HKDF, AES-GCM and the ES256
// VAPID JWT signature.

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** Raw uncompressed P-256 public key, base64url. */
  publicKey: string;
  /** Private JWK (as stored in the VAPID_PRIVATE_JWK secret). */
  privateJwk: JsonWebKey;
  subject: string;
}

async function vapidHeader(endpoint: string, keys: VapidKeys): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { ...keys.privateJwk, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(signingInput)),
  );
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${keys.publicKey}`;
}

/** Encrypts `payload` for a subscription using aes128gcm. */
async function encryptPayload(sub: PushSubscription, payload: string): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);

  const localKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));

  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, localKeys.privateKey, 256),
  );

  // PRK combining the auth secret (RFC 8291 §3.3).
  const authInfo = concat(
    enc.encode("WebPush: info\0"),
    clientPub,
    localPubRaw,
  );
  const ikm = await hkdf(authSecret, shared, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Single record: payload + 0x02 delimiter (last record).
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  // aes128gcm header: salt(16) | rs(4, big endian) | idlen(1) | keyid
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw, ciphertext);
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** True when the endpoint is gone and the subscription should be deleted. */
  expired: boolean;
}

export async function sendPush(
  sub: PushSubscription,
  payload: string,
  keys: VapidKeys,
  ttlSeconds = 3600,
): Promise<PushResult> {
  const body = await encryptPayload(sub, payload);
  const auth = await vapidHeader(sub.endpoint, keys);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body,
  });
  return {
    ok: res.ok,
    status: res.status,
    expired: res.status === 404 || res.status === 410,
  };
}
