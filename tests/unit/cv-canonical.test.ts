import { describe, expect, it } from "vitest";
import { CanonicalError, canonicalize } from "@/supabase/functions/_shared/cv/canonical.ts";
import {
  checkEnvelope,
  formatCode,
  generateSigningKey,
  newCode,
  normaliseCode,
  signEnvelope,
  type CvEnvelope,
} from "@/supabase/functions/_shared/cv/sign.ts";

/** IEEE 754 double from its 16-hex-digit bit pattern (RFC 8785 Appendix B). */
function fromBits(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

describe("RFC 8785 canonical JSON", () => {
  it("matches the RFC's section 3.2.2 example", () => {
    const input = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],' +
        '"string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",' +
        '"literals": [null, true, false]}',
    );
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("sorts keys by UTF-16 code units (section 3.2.3)", () => {
    const input = JSON.parse(
      '{"\\u20ac": "Euro Sign", "\\r": "Carriage Return", "\\ufb33": "Hebrew Letter Dalet With Dagesh", "1": "One",' +
        '"\\ud83d\\ude00": "Emoji: Grinning Face", "\\u0080": "Control", "\\u00f6": "Latin Small Letter O With Diaeresis"}',
    );
    expect(canonicalize(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","\u00f6":"Latin Small Letter O With Diaeresis",' +
        '"\u20ac":"Euro Sign","\ud83d\ude00":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it("serialises numbers as in Appendix B", () => {
    const cases: [string, string][] = [
      ["0000000000000000", "0"],
      ["8000000000000000", "0"],
      ["0000000000000001", "5e-324"],
      ["8000000000000001", "-5e-324"],
      ["7fefffffffffffff", "1.7976931348623157e+308"],
      ["ffefffffffffffff", "-1.7976931348623157e+308"],
      ["4340000000000000", "9007199254740992"],
      ["c340000000000000", "-9007199254740992"],
      ["4430000000000000", "295147905179352830000"],
      ["44b52d02c7e14af5", "9.999999999999997e+22"],
      ["44b52d02c7e14af6", "1e+23"],
      ["44b52d02c7e14af7", "1.0000000000000001e+23"],
      ["444b1ae4d6e2ef4e", "999999999999999700000"],
      ["444b1ae4d6e2ef4f", "999999999999999900000"],
      ["444b1ae4d6e2ef50", "1e+21"],
      ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
      ["3eb0c6f7a0b5ed8d", "0.000001"],
      ["41b3de4355555553", "333333333.3333332"],
      ["41b3de4355555554", "333333333.33333325"],
      ["41b3de4355555555", "333333333.3333333"],
      ["41b3de4355555556", "333333333.3333334"],
      ["41b3de4355555557", "333333333.33333343"],
      ["becbf647612f3696", "-0.0000033333333333333333"],
      ["43143ff3c1cb0959", "1424953923781206.2"],
    ];
    for (const [bits, text] of cases) expect(canonicalize(fromBits(bits))).toBe(text);
    expect(() => canonicalize(fromBits("7ff0000000000000"))).toThrow(CanonicalError);
    expect(() => canonicalize(NaN)).toThrow(CanonicalError);
  });

  it("refuses what isn't I-JSON", () => {
    expect(() => canonicalize({ a: "\ud800" })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: "x\udc00" })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: () => 1 })).toThrow(CanonicalError);
    expect(canonicalize({ b: [], a: {}, c: "😀" })).toBe('{"a":{},"b":[],"c":"😀"}');
  });
});

describe("CV signatures and codes", () => {
  const envelope = (snapshot: Record<string, unknown>, code = "ABCDE12345"): CvEnvelope => ({
    v: 1,
    code,
    key_id: "cv-20261001-aaaaaaaa",
    issued_at: "2026-10-01T19:30:00Z",
    expires_at: "2027-10-01T19:30:00Z",
    snapshot,
  });

  it("verifies with the signing key only, and catches any change", async () => {
    const key = await generateSigningKey(new Date("2026-10-01T00:00:00Z"));
    const other = await generateSigningKey();
    expect(key.keyId).toMatch(/^cv-20261001-[0-9a-f]{8}$/);
    const env = envelope({ person: { name: "Ayesha" }, skills: [{ id: "react", level: 3 }] });
    const { hash, signature } = await signEnvelope(env, key.privateKey);
    expect(await checkEnvelope(env, hash, signature, key.publicKey)).toBe("valid");
    expect(await checkEnvelope(env, hash, signature, other.publicKey)).toBe("bad_signature");
    // Key order doesn't matter (canonical); one changed value does.
    const reordered = { ...env, snapshot: { skills: [{ level: 3, id: "react" }], person: { name: "Ayesha" } } };
    expect(await checkEnvelope(reordered, hash, signature, key.publicKey)).toBe("valid");
    const altered = envelope({ person: { name: "Ayesha" }, skills: [{ id: "react", level: 4 }] });
    expect(await checkEnvelope(altered, hash, signature, key.publicKey)).toBe("hash_mismatch");
    // The code is signed too: the same content under another code doesn't verify.
    expect(await checkEnvelope(envelope(env.snapshot, "ZZZZZ99999"), hash, signature, key.publicKey)).toBe("hash_mismatch");
  });

  it("makes 10-character Crockford codes and reads them back forgivingly", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(formatCode("ABCDE12345")).toBe("ABCDE-12345");
    expect(normaliseCode("abcde-12345")).toBe("ABCDE12345");
    expect(normaliseCode("0Il1o-ABCDE")).toBe("01110ABCDE");
    expect(normaliseCode("ABCDU12345")).toBeNull();
    expect(normaliseCode("short")).toBeNull();
  });
});
