import {Injectable} from "@angular/core";
export type ConnectedDevice={
 id:string;name:string;deviceType:string;platform:string;appVersion:string|null;owner?:{name:string;email:string};
 requestedCapabilities:string[];grantedCapabilities:string[];status:"pending"|"active"|"suspended"|"revoked"|"expired"|"unlinked";
 createdAt:string;updatedAt:string;approvedAt:string|null;lastSeenAt:string|null;
};
@Injectable()
export class ConnectedDevicesApiService{
 private readonly base="/api/connected-devices";
 private async request<T>(token:string,path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(this.base+path,{...init,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Connected Devices request failed");
  return data as T;
 }
 list(token:string):Promise<{devices:ConnectedDevice[];canManage:boolean}>{return this.request(token,"");}
 createPairingChallenge(token:string,requestedCapabilities:string[]):Promise<{challengeId:string;qrPayload:string;expiresAt:string}>{return this.request(token,"/pairing-challenges",{method:"POST",body:JSON.stringify({requestedCapabilities})});}
 cancelPairingChallenge(token:string,id:string):Promise<unknown>{return this.request(token,"/pairing-challenges/"+encodeURIComponent(id)+"/cancel",{method:"POST",body:"{}"});}
 approve(token:string,id:string,grantedCapabilities:string[]):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id)+"/approve",{method:"POST",body:JSON.stringify({grantedCapabilities})});}
 suspend(token:string,id:string):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id)+"/suspend",{method:"POST",body:"{}"});}
 activate(token:string,id:string):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id)+"/activate",{method:"POST",body:"{}"});}
 revoke(token:string,id:string):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id)+"/revoke",{method:"POST",body:"{}"});}
 unlink(token:string,id:string):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id)+"/unlink",{method:"POST",body:"{}"});}
 remove(token:string,id:string):Promise<unknown>{return this.request(token,"/"+encodeURIComponent(id),{method:"DELETE"});}
}
