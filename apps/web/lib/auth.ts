import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import {DrizzleAdapter} from '@auth/drizzle-adapter';
import {getDatabase} from '@labticker/database/runtime';
import {users,authAccounts,authSessions,verificationTokens,authEmailMessages,recordSuccessfulSignIn} from '@labticker/database';
import {eq,isNull,and} from 'drizzle-orm';
import {mockAuthAllowed,githubOAuthAllowed,emailAuthAllowed,signInAllowedByRollout} from './auth-policy';
import {createAuthenticationEmailTransport} from '@labticker/notifications/resend';
import {allowAuthenticationEmail,normalizeEmailIdentifier} from './auth-email-rate';
import {verifiedGithubProfile} from './github-profile';
import {keepInitialVerification,discardProviderTokens} from './auth-adapter';
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
 const github=githubOAuthAllowed(process.env);
 const email=emailAuthAllowed(process.env),emailTransport=email?createAuthenticationEmailTransport(process.env):undefined;
 const baseAdapter=enabled||github||email?DrizzleAdapter(getDatabase(),{usersTable:users,accountsTable:authAccounts,sessionsTable:authSessions,verificationTokensTable:verificationTokens}):undefined;
 const adapter=baseAdapter?keepInitialVerification(discardProviderTokens(baseAdapter)):undefined;
 return {
  secret:process.env.AUTH_SECRET,trustHost:enabled||github||email,session:{strategy:'database',maxAge:60*60*24*7},pages:{signIn:'/auth/sign-in'},
  adapter,
  providers:enabled?[{id:'mock-email',name:'Local mock email',type:'email',from:'local-fixture@example.invalid',maxAge:600,
    sendVerificationRequest:async({url,expires,identifier}:{url:string;expires:Date;identifier:string})=>{if(!mockAuthAllowed(process.env)||!/^[a-z0-9._+-]+@example\.(com|invalid)$/.test(identifier))throw new Error('Mock auth disabled or invalid fixture address');const canonical=new URL(process.env.APP_URL!);const link=new URL(url);if(link.origin!==canonical.origin)throw new Error('Invalid authentication origin');inbox.push({url:link.href,expires});while(inbox.length>10)inbox.shift();},
  }]:[...(github?[GitHub({clientId:process.env.AUTH_GITHUB_ID,clientSecret:process.env.AUTH_GITHUB_SECRET,
   authorization:{params:{scope:'user:email'}},checks:['pkce','state'],
   userinfo:{url:'https://api.github.com/user',async request({tokens}:{tokens:{access_token?:string}}){return verifiedGithubProfile(tokens.access_token);}},
   profile(profile){return {id:String(profile.id),email:profile.email,name:null,image:null};},
   // No email-based account linking; GitHub's stable provider ID is the identity.
   allowDangerousEmailAccountLinking:false,
  })]:[]),...(emailTransport?[{id:'resend-email',name:'Email',type:'email' as const,from:emailTransport.from,maxAge:600,normalizeIdentifier:normalizeEmailIdentifier,sendVerificationRequest:async({url,identifier}:{url:string;identifier:string})=>{const result=await emailTransport.send(identifier,url);await getDatabase().insert(authEmailMessages).values({providerId:result.id}).onConflictDoNothing();}}]:[])],
  callbacks:{signIn({account,user,email}){if(!signInAllowedByRollout(process.env,account))return false;if(account?.provider==='resend-email'&&email?.verificationRequest)return !!user.email&&allowAuthenticationEmail(user.email,process.env.AUTH_SECRET??'');return true;},redirect({url,baseUrl}){const origin=new URL(process.env.APP_URL??baseUrl).origin;try{const destination=new URL(url,origin);return destination.origin===origin?destination.href:origin;}catch{return origin;}},session({session,user}){session.user.id=user.id;return session;}},
  events:{async signIn({user,account}){if(user.id){const trustedGithub=github&&account?.provider==='github';const makeAdmin=trustedGithub&&!!process.env.ADMIN_GITHUB_ACCOUNT_ID&&account?.providerAccountId===process.env.ADMIN_GITHUB_ACCOUNT_ID;await recordSuccessfulSignIn(getDatabase(),user.id,trustedGithub,new Date(),makeAdmin);}}},
  logger:{error:logAuthFailure,warn(){},debug(){}},
 };
});
export async function getCurrentUser():Promise<{id:string;role:string}|null>{
 if(!mockAuthAllowed(process.env)&&!githubOAuthAllowed(process.env)&&!emailAuthAllowed(process.env))return null;
 const session=await auth();if(!session?.user?.id)return null;
 const [user]=await getDatabase().select({id:users.id,role:users.role,emailVerified:users.emailVerified}).from(users).where(and(eq(users.id,session.user.id),isNull(users.deletedAt))).catch(()=>[]);
 if(user&&process.env.OWNER_ACCEPTANCE_ONLY==='true'){
  const [owner]=await getDatabase().select({id:authAccounts.userId}).from(authAccounts).where(and(eq(authAccounts.userId,user.id),eq(authAccounts.provider,'github'),eq(authAccounts.providerAccountId,process.env.ADMIN_GITHUB_ACCOUNT_ID??''))).limit(1).catch(()=>[]);
  if(!owner)return null;
 }
 return user?.emailVerified?{id:user.id,role:user.role}:null;
}

