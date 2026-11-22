import { createHmac } from "node:crypto";

const origin = process.env.BEE_SMOKE_ORIGIN ?? "http://127.0.0.1:38080";
const api = origin + "/api";
const email = process.env.AUTH_ADMIN_EMAIL;
const password = process.env.AUTH_ADMIN_PASSWORD;
if (!email || !password) throw new Error("AUTH_ADMIN_EMAIL and AUTH_ADMIN_PASSWORD are required");

const check = (condition, message) => { if (!condition) throw new Error(message); console.log("PASS " + message); };
const json = async (url, options={}) => {
  const response = await fetch(url, options);
  const body = await response.text();
  let data={}; try { data=body ? JSON.parse(body) : {}; } catch {}
  return {response,data,body};
};
const cookie = response => (response.headers.get("set-cookie") ?? "").split(";")[0];
const base32 = value => {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits="";
  for (const c of value.toUpperCase().replace(/=+$/,"")) {
    const n=alphabet.indexOf(c); if(n<0) throw new Error("Invalid base32 TOTP secret");
    bits+=n.toString(2).padStart(5,"0");
  }
  const bytes=[]; for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  return Buffer.from(bytes);
};
const totp = secret => {
  const counter=Math.floor(Date.now()/30000);
  const msg=Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac("sha1",base32(secret)).update(msg).digest();
  const offset=digest[digest.length-1]&15;
  const binary=digest.readUInt32BE(offset)&0x7fffffff;
  return String(binary%1000000).padStart(6,"0");
};
const headers={ "content-type":"application/json", origin };
const initial=await json(api+"/auth/login",{method:"POST",headers,body:JSON.stringify({email,password,client:"dashboard"})});
check(initial.response.ok && initial.data.accessToken,"admin login");
let refreshCookie=cookie(initial.response);
check(Boolean(refreshCookie),"HttpOnly refresh cookie issued");
const setup=await json(api+"/auth/mfa/setup",{method:"POST",headers:{...headers,authorization:"Bearer "+initial.data.accessToken},body:"{}"});
check(setup.response.ok && setup.data.secret,"MFA setup");
const confirmed=await json(api+"/auth/mfa/confirm",{method:"POST",headers:{...headers,authorization:"Bearer "+initial.data.accessToken},body:JSON.stringify({code:totp(setup.data.secret)})});
check(confirmed.response.ok && Array.isArray(confirmed.data.recoveryCodes) && confirmed.data.recoveryCodes.length===10,"MFA confirmation and recovery codes");
// Confirmation consumes the current TOTP step; wait for a fresh step to prove replay protection.
await new Promise(resolve=>setTimeout(resolve,31000-(Date.now()%30000)));
const mfaLogin=await json(api+"/auth/login",{method:"POST",headers,body:JSON.stringify({email,password,client:"dashboard",mfaCode:totp(setup.data.secret)})});
check(mfaLogin.response.ok && mfaLogin.data.accessToken,"MFA-protected login");
refreshCookie=cookie(mfaLogin.response);
const accessToken=mfaLogin.data.accessToken;
const refresh=await json(api+"/auth/refresh",{method:"POST",headers:{origin,cookie:refreshCookie}});
check(refresh.response.ok && refresh.data.accessToken,"refresh rotation");
const rotatedCookie=cookie(refresh.response);
check(Boolean(rotatedCookie) && rotatedCookie!==refreshCookie,"refresh cookie rotated");


const tenMiB=Buffer.alloc(10*1024*1024,0x61);
const upload=await fetch(api+"/files",{method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/octet-stream","x-file-content-type":"text/plain","x-file-name":"smoke-10mib.txt"},body:tenMiB});
check(upload.status===201,"10 MiB upload accepted");
const elevenMiB=Buffer.alloc(11*1024*1024,0x61);
const oversized=await fetch(api+"/files",{method:"POST",headers:{authorization:"Bearer "+accessToken,"content-type":"application/octet-stream","x-file-content-type":"text/plain","x-file-name":"smoke-11mib.txt"},body:elevenMiB});
check(oversized.status===413,"11 MiB upload rejected");

const headersResponse=await fetch(origin+"/");
for (const [name,value] of [["x-content-type-options","nosniff"],["x-frame-options","DENY"],["referrer-policy","strict-origin-when-cross-origin"],["cross-origin-opener-policy","same-origin"],["cross-origin-resource-policy","same-origin"]]) {
  check(headersResponse.headers.get(name)===value, name+" header");
}
check((headersResponse.headers.get("content-security-policy")??"").includes("script-src 'self'"),"Content-Security-Policy header");

let rateLimited=false;
for(let i=0;i<24;i++){
  const attempt=await fetch(api+"/auth/login",{method:"POST",headers,body:JSON.stringify({email,password:"invalid-smoke-password",client:"dashboard"})});
  if(attempt.status===429){rateLimited=true;break;}
  if(attempt.status!==401) throw new Error("Unexpected login rate-limit probe status: "+attempt.status);
}
check(rateLimited,"login rate limit returns HTTP 429");
const logout=await json(api+"/auth/logout",{method:"POST",headers:{...headers,authorization:"Bearer "+refresh.data.accessToken,cookie:rotatedCookie},body:"{}"});
check(logout.response.ok,"logout");
const revoked=await json(api+"/auth/refresh",{method:"POST",headers:{origin,cookie:rotatedCookie}});
check(revoked.response.status===401,"revoked refresh token rejected");
console.log("All container security smoke checks passed.");
