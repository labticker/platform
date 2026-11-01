export {mockAuthAllowed,assertSameOrigin} from '@labticker/database/auth-policy';
import {createAuthenticationEmailTransport} from '@labticker/notifications/resend';
export function emailAuthAllowed(env:Record<string,string|undefined>):boolean{
 if(env.OWNER_ACCEPTANCE_ONLY==='true')return false;
 if(env.EMAIL_AUTH_ENABLED!=='true'||!(env.WEB_DATABASE_URL||env.DATABASE_URL)||(env.AUTH_SECRET?.length??0)<32)return false;
 try{const url=new URL(env.APP_URL??'');if(url.protocol!=='https:'||!url.hostname.endsWith('.fly.dev')||url.origin!==env.AUTH_URL||url.pathname!=='/'||url.username||url.password||url.search||url.hash)return false;createAuthenticationEmailTransport(env);return true;}catch{return false;}
}
/** Private acceptance is not public enrollment, even when OAuth credentials exist. */
export function signInAllowedByRollout(env:Record<string,string|undefined>,account:{provider?:string;providerAccountId?:string}|null|undefined):boolean{
 if(env.OWNER_ACCEPTANCE_ONLY!=='true')return true;
 return !!env.ADMIN_GITHUB_ACCOUNT_ID&&/^\d+$/.test(env.ADMIN_GITHUB_ACCOUNT_ID)&&account?.provider==='github'&&account.providerAccountId===env.ADMIN_GITHUB_ACCOUNT_ID;
}
/** Credentials alone cannot enroll users. The pilot needs an explicit rollout switch. */
export function githubOAuthAllowed(env:Record<string,string|undefined>):boolean{
 if(env.GITHUB_OAUTH_ENABLED!=='true'||!env.AUTH_GITHUB_ID||!env.AUTH_GITHUB_SECRET||!(env.WEB_DATABASE_URL||env.DATABASE_URL)||(env.AUTH_SECRET?.length??0)<32)return false;
 try{const url=new URL(env.APP_URL??'');return url.protocol==='https:'&&/^[a-z][a-z0-9-]+\.fly\.dev$/.test(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&env.AUTH_URL===url.origin;}catch{return false;}
}
