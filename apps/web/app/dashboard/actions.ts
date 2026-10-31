'use server';
import {guardAccount} from '../../lib/account-errors';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../lib/auth';
import {assertSameOrigin} from '../../lib/auth-policy';
import {getDatabase} from '@labticker/database/runtime';
import {setMonitor} from '@labticker/database/accounts';
export async function toggleMonitor(data:FormData){assertSameOrigin((await headers()).get('origin'),process.env.APP_URL);const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');const id=String(data.get('applicationId')??'');if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid application');await guardAccount(()=>setMonitor(getDatabase(),user.id,id,data.get('active')==='true'));redirect('/dashboard');}
