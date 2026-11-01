import {createHmac} from 'node:crypto';
export function normalizeEmailIdentifier(value:string){
 const email=value.normalize('NFKC').trim().toLowerCase(),parts=email.split('@');
 if(email.length>254||parts.length!==2||!parts[0]||parts[0].length>64||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])||!parts[1]?.includes('.')||parts[1].split('.').some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw new Error('Invalid email address');
 return email;
}
/** Single-web pilot guard: no raw addresses/IPs, bounded memory and no persistent
 * record. A small daily budget reserves most free-tier capacity for digests. */
export function createAuthEmailLimiter(){
 let day='',daily=0;const addresses=new Map<string,{until:number;count:number}>();
 return (address:string,secret:string,now=Date.now())=>{
  if(secret.length<32||address.length>254)return false;
  const date=new Date(now).toISOString().slice(0,10);if(date!==day){day=date;daily=0;}
  for(const [key,value] of addresses)if(value.until<=now)addresses.delete(key);
  const key=createHmac('sha256',secret).update(address).digest('hex'),prior=addresses.get(key);
  if(daily>=25||(prior?.count??0)>=3||(!prior&&addresses.size>=1000))return false;
  addresses.set(key,{count:(prior?.count??0)+1,until:prior?.until??now+3600000});daily++;return true;
 };
}
export const allowAuthenticationEmail=createAuthEmailLimiter();
