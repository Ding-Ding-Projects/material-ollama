import { describe, expect, it } from "vitest"
import {
  generateTotpSecret,
  hashPassword,
  randomHex,
  totpCodeAt,
  verifyPassword,
  verifyTotp,
} from "./locksCrypto"

describe("locksCrypto: password hashing", () => {
  it("never needs the plaintext again -- verifies correct and rejects wrong", async () => {
    const salt = randomHex(16)
    const hash = await hashPassword("correct horse battery staple", salt)
    expect(await verifyPassword("correct horse battery staple", salt, hash)).toBe(true)
    expect(await verifyPassword("wrong password entirely", salt, hash)).toBe(false)
  })

  it("two locks with the same password still get independent salts and hashes", async () => {
    const saltA = randomHex(16)
    const saltB = randomHex(16)
    const hashA = await hashPassword("same-password", saltA)
    const hashB = await hashPassword("same-password", saltB)
    expect(saltA).not.toBe(saltB)
    expect(hashA).not.toBe(hashB)
  })
})

describe("locksCrypto: TOTP (RFC 6238)", () => {
  // RFC 6238 Appendix B's published SHA1 test vector: secret is the ASCII
  // string "12345678901234567890", digits=8. At T=59s (T0=0, X=30s) the
  // expected code is 94287082. Checked against the published vector
  // directly, rather than only round-tripping this module's own encode and
  // decode, so a mistake shared between generation and verification could
  // not silently cancel out.
  const RFC6238_SECRET_ASCII = "12345678901234567890"

  function asciiToBase32(input: string): string {
    const bytes = new TextEncoder().encode(input)
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    let bits = 0
    let value = 0
    let output = ""
    for (const byte of bytes) {
      value = (value << 8) | byte
      bits += 8
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    if (bits > 0) output += alphabet[(value << (5 - bits)) & 31]
    return output
  }

  it("matches the RFC 6238 Appendix B SHA1/8-digit vector at T=59s", async () => {
    const secretBase32 = asciiToBase32(RFC6238_SECRET_ASCII)
    const code = await totpCodeAt(secretBase32, 59_000, { digits: 8, periodSeconds: 30 })
    expect(code).toBe("94287082")
  })

  it("matches the RFC 6238 Appendix B SHA1/8-digit vector at T=1111111109s", async () => {
    const secretBase32 = asciiToBase32(RFC6238_SECRET_ASCII)
    const code = await totpCodeAt(secretBase32, 1_111_111_109_000, { digits: 8, periodSeconds: 30 })
    expect(code).toBe("07081804")
  })

  it("a freshly generated secret verifies its own current code", async () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    const code = await totpCodeAt(secret, now)
    expect(await verifyTotp(code, secret, now)).toBe(true)
  })

  it("tolerates one period of clock skew either direction", async () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000 // fixed instant, aligned arbitrarily
    const codeOnePeriodAgo = await totpCodeAt(secret, now - 30_000)
    expect(await verifyTotp(codeOnePeriodAgo, secret, now)).toBe(true)
  })

  it("rejects a code from two periods away", async () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    const codeTwoPeriodsAgo = await totpCodeAt(secret, now - 60_000)
    expect(await verifyTotp(codeTwoPeriodsAgo, secret, now)).toBe(false)
  })

  it("rejects an empty or garbage code", async () => {
    const secret = generateTotpSecret()
    expect(await verifyTotp("", secret)).toBe(false)
    expect(await verifyTotp("not-digits", secret)).toBe(false)
  })

  it("two independently generated secrets are different", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret())
  })
})
