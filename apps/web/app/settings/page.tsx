import {guardAccount} from '../../lib/account-errors';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {accountDashboard} from '@labticker/database/accounts';
import {updateSettings,removeAccount} from './actions';
export const dynamic='force-dynamic';
export default async function Settings(){const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');const state=await guardAccount(()=>accountDashboard(getDatabase(),user.id));return <main><h1>Digest preferences</h1><p>Weekly by default. Public delivery remains disabled.</p>{state.suppressed&&<p>Your account is suppressed. Saving settings cannot silently restore sending.</p>}<form action={updateSettings}><label>Frequency<select name="frequency" defaultValue={state.preferences?.frequency??'weekly'}><option value="weekly">Weekly · Monday</option><option value="daily">Daily</option></select></label><label>IANA timezone<input name="timezone" defaultValue={state.preferences?.timezone??'UTC'} required/></label><p>Scheduled for 09:00 in your chosen timezone.</p><label><input name="enabled" type="checkbox" defaultChecked={state.preferences?.enabled??false}/>Enable digest schedule</label><label><input name="consent" type="checkbox" defaultChecked={state.consented}/>I expressly consent to LabTicker release-update digests for my selected applications. I can unsubscribe at any time. (digest-v1)</label><button>Save preferences</button></form><h2>Delete account</h2><p>Removes profile, contact details, sessions and monitor selections. Pseudonymous delivery and compliance records remain subject to retention policy.</p><form action={removeAccount}><label>Type DELETE<input name="confirmation" required pattern="DELETE"/></label><button>Delete my account</button></form><a href="/dashboard">Back to monitors</a></main>;}


