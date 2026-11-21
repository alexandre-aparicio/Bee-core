import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(input:Buffer):string {
 let bits=0,value=0,out="";
 for(const byte of input){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
 if(bits>0)out+=alphabet[(value<<(5-bits))&31];
 return out;
}
export function base32Decode(input:string):Buffer {
 const normalized=input.toUpperCase().replace(/=+$/,"").replace(/\s+/g,"");
 let bits=0,value=0;const bytes:number[]=[];
 for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new Error("Invalid Base32 secret");value=(value<<5)|index;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(bytes);
}
export function createTotpSecret():string { return base32Encode(randomBytes(20)); }
export function verifyTotp(secret:string,code:string,at=Date.now()):number|null {
 if(!/^\d{6}$/.test(code))return null;
 const key=base32Decode(secret),current=Math.floor(at/1000/30);
 for(const step of [current-1,current,current+1]){
  const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));
  const digest=createHmac("sha1",key).update(msg).digest(),offset=digest[digest.length-1]&15;
  const binary=((digest[offset]&127)<<24)|((digest[offset+1]&255)<<16)|((digest[offset+2]&255)<<8)|(digest[offset+3]&255);
  const expected=Buffer.from(String(binary%1_000_000).padStart(6,"0"));
  const actual=Buffer.from(code);
  if(expected.length===actual.length&&timingSafeEqual(expected,actual))return step;
 }
 return null;
}
export function provisioningUri(secret:string,email:string,issuer="Bee Core"):string {
 return "otpauth://totp/"+encodeURIComponent(issuer+":"+email)+"?secret="+secret+"&issuer="+encodeURIComponent(issuer)+"&algorithm=SHA1&digits=6&period=30";
}
