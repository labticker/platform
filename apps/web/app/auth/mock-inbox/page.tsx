import {mockInbox} from '../../../lib/auth';
import {mockAuthAllowed} from '../../../lib/auth-policy';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default function Inbox(){if(!mockAuthAllowed(process.env))notFound();return <main><h1>Local test inbox</h1><p>These short-lived links sign in fictional accounts on this development server. No messages are sent.</p>{mockInbox().map((message,index)=><p key={index}><a href={message.url}>Sign in to test account {index+1}</a></p>)}<a href="/auth/sign-in">Request another link</a></main>;}
