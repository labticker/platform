'use server';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../lib/auth';
import {assertSameOrigin} from '../../lib/auth-policy';
import {getDatabase} from '@labticker/database/runtime';
import {savePreferences,deleteAccount} from '@labticker/database/accounts';
import {nextDigestAt} from '@labticker/notifications';
export async function updateSettings(data:FormData){assertSameOrigin((await headers()).get('origin'),process.env.APP_URL);const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');const frequency=data.get('frequency');if(frequency!=='daily'&&frequency!=='weekly')throw new Error('Invalid frequency');const timezone=String(data.get('timezone')??'UTC');const now=new Date();await savePreferences(getDatabase(),user.id,{frequency,timezone,enabled:data.get('enabled')==='on',consent:data.get('consent')==='on',nextDueAt:nextDigestAt(now,frequency,timezone)},now);redirect('/settings');}
export async function removeAccount(data:FormData){assertSameOrigin((await headers()).get('origin'),process.env.APP_URL);const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');if(data.get('confirmation')!=='DELETE')throw new Error('Type DELETE to confirm account deletion');await deleteAccount(getDatabase(),user.id);redirect('/auth/sign-in');}
