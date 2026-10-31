/** GitHub's public profile email alone is insufficient proof of mailbox verification. */
export async function verifiedGithubProfile(token:string|undefined,request:typeof fetch=fetch){
 if(!token)throw new Error('GitHub identity unavailable');
 try{
  const headers={Authorization:`Bearer ${token}`,'User-Agent':'LabTicker','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const read=async(path:string)=>{
   const response=await request(`https://api.github.com${path}`,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Identity unavailable');
   const body=await response.text();if(body.length>65536)throw new Error('Identity response too large');
   return JSON.parse(body) as unknown;
  };
  const [profile,emails]=await Promise.all([read('/user'),read('/user/emails?per_page=100')]);
  if(!profile||typeof profile!=='object'||!('id' in profile)||!Number.isSafeInteger(profile.id)||Number(profile.id)<=0||!Array.isArray(emails))throw new Error('Identity unavailable');
  const primary=emails.filter(row=>row&&typeof row==='object'&&row.primary===true&&row.verified===true);
  const email=primary.length===1&&typeof primary[0].email==='string'?primary[0].email.trim().toLowerCase():'';
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Verified primary email required');
  return {id:Number(profile.id),email,verified:true as const};
 }catch{throw new Error('GitHub verified identity unavailable');}
}
