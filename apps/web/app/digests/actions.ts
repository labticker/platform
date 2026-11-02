'use server';
import {headers} from 'next/headers';
import {after} from 'next/server';
import {redirect} from 'next/navigation';
import {getCurrentUser} from '../../lib/auth';
import {assertSameOrigin} from '../../lib/auth-policy';
import {privateEmailTestVisible} from '../../lib/email-testing';
import {getDatabase} from '@labticker/database/runtime';
import {emailTestingAllowed,enqueueEmailTest,sendOneEmailTest} from '@labticker/database/email-testing';
import {createPrivateEmailTestTransport} from '@labticker/notifications/email-testing';
export async function sendEmailTest(data:FormData):Promise<void>{
 assertSameOrigin((await headers()).get('origin'),process.env.APP_URL);
 const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');
 if(!privateEmailTestVisible(process.env,user)||!emailTestingAllowed(process.env,user))redirect('/digests');
 if(data.get('testConsent')!=='on')redirect('/digests?emailTest=consent');
 const requestId=data.get('requestId');
 if(typeof requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))redirect('/digests?emailTest=unavailable');
 let status='unavailable';
 try{status=(await enqueueEmailTest(getDatabase(),{userId:user.id,consent:true,requestId},process.env)).status;}catch{}
 if(status==='queued')after(async()=>{
  // One targeted attempt after the response; the durable queue remains the fallback.
  try{await sendOneEmailTest(getDatabase(),createPrivateEmailTestTransport(process.env),process.env,new Date(),{userId:user.id,requestId});}catch{}
 });
 redirect(`/digests?emailTest=${encodeURIComponent(status)}`);
}
