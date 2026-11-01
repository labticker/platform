import {getCurrentUser} from '../../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {readUserDigests} from '@labticker/database/digests';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 if(new URL(request.url).searchParams.size)return Response.json({error:'Unsupported query'},{status:400,headers});
 const user=await getCurrentUser();if(!user)return Response.json({error:'Unauthorized'},{status:401,headers});
 try{return Response.json(await readUserDigests(getDatabase(),user.id,process.env.EMAIL_DELIVERY_MODE==='resend'?'resend':'mock'),{headers});}
 catch{return Response.json({error:'Digests unavailable'},{status:503,headers});}
}
