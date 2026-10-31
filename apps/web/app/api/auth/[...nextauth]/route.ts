import {handlers} from '../../../../lib/auth';
import {mockAuthAllowed} from '../../../../lib/auth-policy';
import type {NextRequest} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){if(!mockAuthAllowed(process.env))return new Response('Public sign-in is not enabled',{status:503});return handlers.GET(request);}
export async function POST(request:NextRequest){if(!mockAuthAllowed(process.env))return new Response('Public sign-in is not enabled',{status:503});return handlers.POST(request);}
