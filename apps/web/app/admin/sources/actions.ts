'use server';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../../lib/auth';
import {assertSameOrigin} from '../../../lib/auth-policy';
import {getDatabase} from '@labticker/database/runtime';
import {setSourceEnabled} from '@labticker/database/source-admin';
import {currentSourceRegistry} from './registry';
export async function changeSourceState(data:FormData){
 assertSameOrigin((await headers()).get('origin'),process.env.APP_URL);
 const actor=await getCurrentUser();if(!actor)redirect('/auth/sign-in');if(actor.role!=='admin')throw new Error('Administrator required');
 const sourceId=data.get('sourceId'),enabled=data.get('enabled');
 if(typeof sourceId!=='string'||(enabled!=='true'&&enabled!=='false'))throw new Error('Invalid source administration request');
 try{await setSourceEnabled(getDatabase(),actor.id,sourceId,enabled==='true',await currentSourceRegistry());}
 catch{throw new Error('Source update unavailable; verify administrator access and the reviewed registry');}
 redirect('/admin/sources');
}
