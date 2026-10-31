export {mockAuthAllowed,assertSameOrigin} from '@labticker/database/auth-policy';
/** Credentials alone cannot enroll users. The pilot needs an explicit rollout switch. */
export function githubOAuthAllowed(env:Record<string,string|undefined>):boolean{
 if(env.GITHUB_OAUTH_ENABLED!=='true'||!env.AUTH_GITHUB_ID||!env.AUTH_GITHUB_SECRET||!env.DATABASE_URL||(env.AUTH_SECRET?.length??0)<32)return false;
 try{const url=new URL(env.APP_URL??'');return url.protocol==='https:'&&/^[a-z][a-z0-9-]+\.fly\.dev$/.test(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&env.AUTH_URL===url.origin;}catch{return false;}
}
