//go:build windows || darwin

package ui

import (
	"testing"
	"time"
)

// TestTOTPRFC6238Vectors verifies this file's TOTP implementation against
// every published test vector in RFC 6238 Appendix B (all three supported
// hash algorithms, digits=8, period=30, T0=0). An authenticator that is
// subtly wrong produces codes that are silently rejected everywhere, with
// no error anywhere to explain why, so this is checked directly against the
// spec's own worked examples rather than assumed correct.
func TestTOTPRFC6238Vectors(t *testing.T) {
	const (
		seedSHA1   = "12345678901234567890"
		seedSHA256 = "12345678901234567890123456789012"
		seedSHA512 = "1234567890123456789012345678901234567890123456789012345678901234"
	)

	tests := []struct {
		unixTime  int64
		algorithm string
		seed      string
		want      string
	}{
		{59, "SHA1", seedSHA1, "94287082"},
		{59, "SHA256", seedSHA256, "46119246"},
		{59, "SHA512", seedSHA512, "90693936"},

		{1111111109, "SHA1", seedSHA1, "07081804"},
		{1111111109, "SHA256", seedSHA256, "68084774"},
		{1111111109, "SHA512", seedSHA512, "25091201"},

		{1111111111, "SHA1", seedSHA1, "14050471"},
		{1111111111, "SHA256", seedSHA256, "67062674"},
		{1111111111, "SHA512", seedSHA512, "99943326"},

		{1234567890, "SHA1", seedSHA1, "89005924"},
		{1234567890, "SHA256", seedSHA256, "91819424"},
		{1234567890, "SHA512", seedSHA512, "93441116"},

		{2000000000, "SHA1", seedSHA1, "69279037"},
		{2000000000, "SHA256", seedSHA256, "90698825"},
		{2000000000, "SHA512", seedSHA512, "38618901"},

		{20000000000, "SHA1", seedSHA1, "65353130"},
		{20000000000, "SHA256", seedSHA256, "77737706"},
		{20000000000, "SHA512", seedSHA512, "47863826"},
	}

	for _, tc := range tests {
		got, err := totpCodeAt([]byte(tc.seed), time.Unix(tc.unixTime, 0).UTC(), 30, 8, tc.algorithm)
		if err != nil {
			t.Fatalf("totpCodeAt(t=%d, %s): unexpected error: %v", tc.unixTime, tc.algorithm, err)
		}
		if got != tc.want {
			t.Errorf("totpCodeAt(t=%d, %s) = %q, want %q", tc.unixTime, tc.algorithm, got, tc.want)
		}
	}
}

// TestDecodeBase32SecretRoundTrip checks that a freshly generated secret
// survives base32 encode -> decode unchanged, and that decoding tolerates
// the grouping/padding real authenticator apps and QR generators add.
func TestDecodeBase32SecretRoundTrip(t *testing.T) {
	secret, err := generateTOTPSecret()
	if err != nil {
		t.Fatalf("generateTOTPSecret: %v", err)
	}
	encoded := encodeBase32Secret(secret)

	decoded, err := decodeBase32Secret(encoded)
	if err != nil {
		t.Fatalf("decodeBase32Secret(%q): %v", encoded, err)
	}
	if string(decoded) != string(secret) {
		t.Fatalf("round trip mismatch: got %x, want %x", decoded, secret)
	}

	// Lowercase, whitespace-grouped, and padded variants of the same
	// secret must all decode to the identical bytes.
	messy := ""
	for i, r := range encoded {
		if i > 0 && i%4 == 0 {
			messy += " "
		}
		messy += string(r)
	}
	for len(messy)%8 != 0 {
		messy += "="
	}
	decodedMessy, err := decodeBase32Secret(messy)
	if err != nil {
		t.Fatalf("decodeBase32Secret(%q): %v", messy, err)
	}
	if string(decodedMessy) != string(secret) {
		t.Fatalf("messy round trip mismatch: got %x, want %x", decodedMessy, secret)
	}
}

// TestNormalizeTOTPParamsDefaults checks the documented SHA1/6/30 defaults
// and that an unsupported algorithm is rejected rather than silently
// substituted.
func TestNormalizeTOTPParamsDefaults(t *testing.T) {
	algorithm, digits, period, err := normalizeTOTPParams("", 0, 0)
	if err != nil {
		t.Fatalf("normalizeTOTPParams(defaults): %v", err)
	}
	if algorithm != "SHA1" || digits != 6 || period != 30 {
		t.Fatalf("defaults = (%s, %d, %d), want (SHA1, 6, 30)", algorithm, digits, period)
	}

	if _, _, _, err := normalizeTOTPParams("MD5", 0, 0); err == nil {
		t.Fatal("normalizeTOTPParams(\"MD5\", ...) should have been rejected, got nil error")
	}
}
