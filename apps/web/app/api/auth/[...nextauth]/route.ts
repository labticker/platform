import {handlers} from '../../../../lib/auth';
import {mockAuthAllowed,githubOAuthAllowed,emailAuthAllowed} from '../../../../lib/auth-policy';
import type {NextRequest} from 'next/server';
export const dynamic='force-dynamic';
function enabled(){return mockAuthAllowed(process.env)||githubOAuthAllowed(process.env)||emailAuthAllowed(process.env);}
export async function GET(request:NextRequest){if(!enabled())return new Response('Public sign-in is not enabled',{status:503});return handlers.GET(request);}
export async function POST(request:NextRequest){if(!enabled())return new Response('Public sign-in is not enabled',{status:503});return handlers.POST(request);}
