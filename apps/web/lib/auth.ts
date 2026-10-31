import NextAuth from 'next-auth';
import {DrizzleAdapter} from '@auth/drizzle-adapter';
import {getDatabase} from '@labticker/database/runtime';
import {users,authAccounts,authSessions,verificationTokens,recordAccountState} from '@labticker/database';
import {eq,isNull,and} from 'drizzle-orm';
import {mockAuthAllowed} from './auth-policy';
import {keepInitialVerification} from './auth-adapter';
const globalAuth=globalThis as typeof globalThis & {labtickerMockInbox?:{url:string;expires:Date}[]};
const inbox=globalAuth.labtickerMockInbox??=[];
function logAuthFailure(error:Error){
 const categories:string[]=[];const codes:string[]=[];let current:unknown=error;
 for(let index=0;current&&index<5;index++){
  const entry=current as {name?:string;type?:string;code?:unknown;cause?:unknown;err?:unknown};
  categories.push(String(entry.type??entry.name??'Error').replace(/[^a-z]/gi,'').slice(0,40));
  if(typeof entry.code==='string'&&/^[A-Z0-9_]{1,32}$/i.test(entry.code)) codes.push(entry.code);
  current=entry.err??entry.cause;
 }
 console.error(JSON.stringify({service:'auth',categories,codes}));
}
export function mockInbox(){return mockAuthAllowed(process.env)?inbox.filter(m=>m.expires>new Date()).slice(-10):[];}
export const {handlers,auth,signIn,signOut}=NextAuth(()=>{
 const enabled=mockAuthAllowed(process.env);
 const baseAdapter=enabled?DrizzleAdapter(getDatabase(),{usersTable:users,accountsTable:authAccounts,sessionsTable:authSessions,verificationTokensTable:verificationTokens}):undefined;
 const adapter=baseAdapter?keepInitialVerification(baseAdapter):undefined;
 return {
  secret:process.env.AUTH_SECRET,trustHost:enabled,session:{strategy:'database',maxAge:60*60*24*7},pages:{signIn:'/auth/sign-in'},
  adapter,
  providers:enabled?[{id:'mock-email',name:'Local mock email',type:'email',from:'local-fixture@example.invalid',maxAge:600,
    sendVerificationRequest:async({url,expires,identifier}:{url:string;expires:Date;identifier:string})=>{if(!mockAuthAllowed(process.env)||!/^[a-z0-9._+-]+@example\.(com|invalid)$/.test(identifier))throw new Error('Mock auth disabled or invalid fixture address');const canonical=new URL(process.env.APP_URL!);const link=new URL(url);if(link.origin!==canonical.origin)throw new Error('Invalid authentication origin');inbox.push({url:link.href,expires});while(inbox.length>10)inbox.shift();},
  }]:[],
  callbacks:{redirect({url,baseUrl}){const origin=new URL(process.env.APP_URL??baseUrl).origin;try{const destination=new URL(url,origin);return destination.origin===origin?destination.href:origin;}catch{return origin;}},session({session,user}){session.user.id=user.id;return session;}},
  events:{async signIn({user,isNewUser}){if(isNewUser&&user.id){const [record]=await getDatabase().select().from(users).where(eq(users.id,user.id));if(record?.emailVerified)await recordAccountState(getDatabase(),user.id,'verified_signup',record.emailVerified);}}},
  logger:{error:logAuthFailure,warn(){},debug(){}},
 };
});
export async function getCurrentUser():Promise<{id:string;role:string}|null>{
 if(!mockAuthAllowed(process.env))return null;
 const session=await auth();if(!session?.user?.id)return null;
 const [user]=await getDatabase().select({id:users.id,role:users.role,emailVerified:users.emailVerified}).from(users).where(and(eq(users.id,session.user.id),isNull(users.deletedAt)));
 return user?.emailVerified?{id:user.id,role:user.role}:null;
}

