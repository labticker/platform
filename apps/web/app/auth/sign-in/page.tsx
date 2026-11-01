import {TrackedButton} from '../../tracked-controls';
import {SiteHeader,SiteFooter} from '../../site-chrome';
import {signIn} from '../../../lib/auth';
import {mockAuthAllowed,githubOAuthAllowed,emailAuthAllowed} from '../../../lib/auth-policy';
export const dynamic='force-dynamic';
export default async function SignIn({searchParams}:{searchParams:Promise<{error?:string}>}){
 const mock=mockAuthAllowed(process.env),github=githubOAuthAllowed(process.env),email=emailAuthAllowed(process.env);
 const error=(await searchParams).error;
 return <main><SiteHeader/><section className="page-heading prose"><p className="eyebrow">YOUR HOMELAB, TOGETHER</p><h1>Sign in to LabTicker</h1><p>Save your applications and choose when to catch up on releases.</p>
 {error&&<p className="notice">{process.env.OWNER_ACCEPTANCE_ONLY==='true'&&error==='AccessDenied'?'This acceptance build is restricted to the project owner.':'Sign-in could not be completed. Please try again later or use another available sign-in method.'}</p>}
 {github&&<div className="panel"><form action={async()=>{'use server';if(!githubOAuthAllowed(process.env))throw new Error('GitHub sign-in unavailable');await signIn('github',{redirectTo:'/dashboard'});}}><button>Continue with GitHub</button></form><p className="muted">We use your account ID and verified primary email. We do not retain GitHub access tokens or request repository access.</p></div>}
 {email&&<div className="panel"><form action={async(data:FormData)=>{'use server';if(!emailAuthAllowed(process.env))throw new Error('Email sign-in unavailable');const address=String(data.get('email')??'').trim().toLowerCase();await signIn('resend-email',{email:address,redirectTo:'/dashboard'});}}><label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><button>Email me a sign-in link</button></form><p className="muted">The link expires in ten minutes. Signing in does not subscribe you to release digests.</p></div>}
 {mock&&<div className="panel"><p>Local test mode only. No email is sent. Use fictional test addresses.</p><form action={async(data:FormData)=>{'use server';if(!mockAuthAllowed(process.env))throw new Error('Test auth disabled');const address=String(data.get('email')??'').trim().toLowerCase();if(!/^[a-z0-9._+-]+@example\.(com|invalid)$/.test(address))throw new Error('Use a fictional example.com address');await signIn('mock-email',{email:address,redirectTo:'/dashboard'});}}><label>Test email<input name="email" type="email" required placeholder="tester@example.com"/></label><TrackedButton event="signup_started">Request test sign-in link</TrackedButton></form><a href="/auth/mock-inbox">Open local mock inbox</a></div>}
 {!email&&!mock&&<p>Public email sign-in is unavailable until a verified sender and email rollout are approved.</p>}
 {process.env.EMAIL_DELIVERY_MODE!=='resend'&&<p className="notice">Email delivery preview: digests are simulated and no release email is sent.</p>}
 <p><a href="/privacy" className="text-link">Privacy details</a> · <a href="/apps" className="text-link">Browse applications</a></p></section><SiteFooter/></main>;
}
