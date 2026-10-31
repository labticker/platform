export function mockAuthAllowed(env:Record<string,string|undefined>):boolean{
 if(env.NODE_ENV==='production'||env.AUTH_TEST_MODE!=='true'||!env.DATABASE_URL||!env.AUTH_SECRET||env.AUTH_SECRET.length<32) return false;
 try{const url=new URL(env.APP_URL??'');return ['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.protocol==='http:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/';}catch{return false;}
}
export function assertSameOrigin(origin:string|null,configured:string|undefined){if(!configured||!origin||new URL(configured).origin!==origin)throw new Error('Invalid request origin');}
