import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, verifyTotp } from "../src/core/totp.js";

test("Base32 round-trips authenticator secrets",()=>{
 const original=Buffer.from("Bee Core MFA secret","utf8");
 assert.deepEqual(base32Decode(base32Encode(original)),original);
});

test("TOTP accepts the RFC 6238 SHA-1 six-digit vector",()=>{
 const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
 assert.equal(verifyTotp(secret,"287082",59_000),1);
});

test("TOTP rejects malformed and incorrect codes",()=>{
 const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
 assert.equal(verifyTotp(secret,"12345",59_000),null);
 assert.equal(verifyTotp(secret,"000000",59_000),null);
});
