// Toy-grade credential material for the for-fun element-lock system (see
// ../components/locks/locks.dict.ts's header for the "this is a toy, not a
// security boundary" framing every lock surface repeats to the user).
//
// The real "Locked tabs and locked appearance" contract wants a lock's
// credential in the operating system's own vault (Windows Credential
// Manager / macOS keychain), exactly like app/ui/totp.go's real
// authenticator does for its accounts. This lane's allowed paths are
// frontend-only (src/components/locks/** and src/uh/locks*) -- there is no
// Go route registered for a toy lock's credential, and adding one is out of
// this lane's scope. So, matching the established placeholder pattern this
// codebase already uses for preferences (see ../uh/provider.tsx's own
// header comment: "a sibling lane is adding the real Go-backed store; until
// then this reads/writes nothing on its own"), a lock's credential lives in
// this renderer's own local storage until a sibling lane wires a real vault
// endpoint. That is not a regression from "toy": the shared contract for
// this feature explicitly says a toy lock is a self-imposed speed bump, not
// encryption, and its own recovery path is "delete the app's local data
// folder" -- browser storage under that same local profile is exactly that
// kind of thing, described honestly rather than dressed up as a vault.
//
// What *is* still worth doing properly, even for a toy: never keep a
// plaintext password around. Passwords are salted and hashed with SHA-256
// (via the real Web Crypto `crypto.subtle`, available in both the Electron
// renderer and this project's jsdom test environment) run through a few
// extra rounds -- explicitly NOT a real KDF (no argon2/bcrypt/scrypt here),
// just enough to avoid storing the raw bytes. TOTP needs the secret itself
// to compute a live code client-side (there is no backend to verify
// against), so the secret is kept as the pairing-secret base32 string --
// the same tradeoff the real authenticator's provisioning URI already
// makes for the one documented "pairing reveal" moment, except here it is
// the whole lock's lifetime rather than a single reveal, disclosed to the
// user as such.

const HASH_ROUNDS = 4

function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return bytesToHex(new Uint8Array(digest))
}

/** A fresh random hex string, `byteLength` bytes wide (so `byteLength * 2` hex chars). */
export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/**
 * Salt + a few rounds of SHA-256. Toy-grade on purpose (see header) -- this
 * is "don't store the raw password", not "resist an offline cracking
 * attempt", and the UI never claims otherwise.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  let value = `${salt}:${password}`
  for (let round = 0; round < HASH_ROUNDS; round += 1) {
    value = await sha256Hex(`${value}:${salt}:${round}`)
  }
  return value
}

/** Constant-time-ish string compare -- cheap insurance against a timing
 * side-channel on the hash comparison itself. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashPassword(password, salt)
  return timingSafeEqualHex(actual, expectedHash)
}

// --- RFC 4226 HOTP / RFC 6238 TOTP, ported from app/ui/totp.go's Go
// implementation to the one Web Crypto primitive it needs (HMAC-SHA1) so a
// toy lock's TOTP method can compute and check a live code entirely
// client-side, with no server round trip. -----------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** A fresh random pairing secret at RFC 4226's recommended 160-bit HOTP key
 * length, base32-encoded exactly as an authenticator app expects. */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return base32Encode(bytes)
}

// Plain `BigInt(...)` calls, not `8n`/`0xffn` literal syntax -- this
// project's configured build target does not support BigInt literals and
// esbuild warns (rightly) that they "may crash at run-time" there, even
// though the value itself never exceeds what a counter realistically
// needs. A function call carries the same 64-bit-safe arithmetic without
// depending on literal-syntax support.
const BIG_EIGHT = BigInt(8)
const BIG_0XFF = BigInt(0xff)

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8)
  let value = BigInt(Math.floor(counter))
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = Number(value & BIG_0XFF)
    value >>= BIG_EIGHT
  }
  return bytes
}

async function hotpCode(secretBytes: Uint8Array, counter: number, digits: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.slice().buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)))
  const offset = signature[signature.length - 1] & 0x0f
  const truncated =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)
  const mod = 10 ** digits
  return String(truncated % mod).padStart(digits, "0")
}

export interface TotpParams {
  digits?: number
  periodSeconds?: number
}

const TOTP_DEFAULT_DIGITS = 6
const TOTP_DEFAULT_PERIOD_SECONDS = 30

/** RFC 6238 TOTP: HOTP(secret, floor((atMs/1000)/period)). */
export async function totpCodeAt(
  secretBase32: string,
  atMs: number,
  params: TotpParams = {},
): Promise<string> {
  const digits = params.digits ?? TOTP_DEFAULT_DIGITS
  const period = params.periodSeconds ?? TOTP_DEFAULT_PERIOD_SECONDS
  const counter = Math.floor(atMs / 1000 / period)
  return hotpCode(base32Decode(secretBase32), counter, digits)
}

/** Checks `code` against the current period and one period either side, to
 * absorb ordinary clock skew between this machine and whatever generated
 * the code -- the same ±1-step tolerance app/ui/totp.go documents. */
export async function verifyTotp(
  code: string,
  secretBase32: string,
  atMs: number = Date.now(),
  params: TotpParams = {},
): Promise<boolean> {
  const trimmed = code.trim()
  if (!trimmed) return false
  const period = params.periodSeconds ?? TOTP_DEFAULT_PERIOD_SECONDS
  const periodMs = period * 1000
  for (const drift of [0, -1, 1]) {
    const candidate = await totpCodeAt(secretBase32, atMs + drift * periodMs, params)
    if (candidate === trimmed) return true
  }
  return false
}
