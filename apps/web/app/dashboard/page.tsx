import {guardAccount} from '../../lib/account-errors';
import {TrackedButton,TrackedLink} from '../tracked-controls';
import {redirect} from 'next/navigation';
import {getCurrentUser,signOut} from '../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {accountDashboard} from '@labticker/database/accounts';
import {toggleMonitor} from './actions';
export const dynamic='force-dynamic';
export default async function Dashboard(){const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');const state=await guardAccount(()=>accountDashboard(getDatabase(),user.id));return <main><h1>Your homelab monitors</h1><p>Mock email only. These preferences do not enable public email delivery.</p><TrackedLink event="digest_preference_opened" href="/settings">Digest settings</TrackedLink><p>{state.monitors.filter(m=>m.active).length} active monitors</p><div className="grid">{state.apps.map(app=>{const active=state.monitors.some(m=>m.applicationId===app.id&&m.active);return <article key={app.id}><h2>{app.name}</h2><p>{app.category} · {app.status}</p><form action={toggleMonitor}><input type="hidden" name="applicationId" value={app.id}/><input type="hidden" name="active" value={String(!active)}/><TrackedButton event="monitor_toggle_clicked">{active?'Stop monitoring':'Monitor'}</TrackedButton></form></article>;})}</div><h2>Recent releases</h2>{state.recent.map((release,index)=><p key={index}>{release.appName}: <TrackedLink event="release_notes_link_clicked" href={release.url} rel="noreferrer">{release.title}</TrackedLink></p>)}<form action={async()=>{'use server';await signOut({redirectTo:'/'});}}><button>Sign out</button></form></main>;}
