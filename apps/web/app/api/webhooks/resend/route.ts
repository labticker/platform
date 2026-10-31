import {getDatabase} from '@labticker/database/runtime';
import {RetryableWebhook,processResendEvent,readWebhookBody,verifyResendWebhook} from '@labticker/telemetry';
export const runtime='nodejs';
export async function POST(request:Request):Promise<Response>{
 const secret=process.env.RESEND_WEBHOOK_SECRET;
 if(!secret||!process.env.DATABASE_URL)return Response.json({error:'Webhook unavailable'},{status:503});
 let event;
 try {event=verifyResendWebhook(await readWebhookBody(request),request.headers,secret);}
 catch{return Response.json({error:'Invalid webhook'},{status:400});}
 try {const result=await processResendEvent(getDatabase(),event);return Response.json({status:result});}
 catch(error){return Response.json({error:error instanceof RetryableWebhook?'Retry later':'Webhook unavailable'},{status:503,headers:{'Retry-After':'60'}});}
}
