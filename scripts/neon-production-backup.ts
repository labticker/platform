import {writeFile} from 'node:fs/promises';
interface Branch{id:string;parent_id?:string;parent_lsn?:string;created_at:string;current_state:string;name:string;}
async function main(){
 const project=process.env.NEON_PROJECT_ID??'',parent=process.env.NEON_MAIN_BRANCH_ID??'',token=process.env.NEON_API_KEY;
 if(!token||!/[a-z0-9]/.test(project)||!/^[-a-z0-9]+$/.test(project)||!/^br-[-a-z0-9]+$/.test(parent))throw new Error('Approved Neon backup configuration required');
 const api=async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`https://console.neon.tech/api/v2/projects/${project}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Backup API request failed');
  return await response.json() as {branch:Branch};
 };
 // Bind protected migration credentials to the approved main branch endpoint. Do
 // not trust a backup ID alone when a wrong development DSN could be configured.
 const migrationUrl=new URL(process.env.MIGRATION_DATABASE_URL??'');
 if(!['postgres:','postgresql:'].includes(migrationUrl.protocol))throw new Error('Migration target required');
 const endpointData=await api('/endpoints') as unknown as {endpoints?:{branch_id:string;host:string;type:string}[]};
 const hostname=migrationUrl.hostname.replace('-pooler.','.');
 if(!endpointData.endpoints?.some(endpoint=>endpoint.branch_id===parent&&endpoint.type==='read_write'&&endpoint.host===hostname))throw new Error('Migration target does not match approved main branch');
 let id=process.env.NEON_BACKUP_BRANCH_ID??'';
 if(process.env.NEON_BACKUP_CREATE==='true'){
  if(process.env.BACKUP_CREATION_APPROVED!=='true'||id)throw new Error('Explicit unused backup approval required');
  const name=`pre-deploy-${Date.now()}`;
  const result=await api('/branches','POST',{branch:{name,parent_id:parent,init_source:'parent-data'}});
  id=result.branch.id;
 }
 if(!/^br-[-a-z0-9]+$/.test(id)||id===parent)throw new Error('Distinct backup branch ID required');
 let branch:Branch|undefined;
 for(let attempt=0;attempt<20;attempt++){
  branch=(await api(`/branches/${id}`)).branch;
  if(branch.current_state==='ready')break;
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 const age=Date.now()-Date.parse(branch?.created_at??'');
 if(!branch||branch.parent_id!==parent||branch.current_state!=='ready'||!branch.parent_lsn||!Number.isFinite(age)||age< -300000||age>86400000)throw new Error('Backup branch is not a fresh ready data clone of main');
 const attestation={projectId:project,parentBranchId:parent,backupBranchId:id,parentLsn:branch.parent_lsn,createdAt:branch.created_at,verifiedAt:new Date().toISOString(),ready:true,migrationTargetVerified:true,migrationHost:hostname,restoreTested:false};
 if(process.env.BACKUP_ATTESTATION_PATH)await writeFile(process.env.BACKUP_ATTESTATION_PATH,JSON.stringify(attestation));
 console.log(JSON.stringify(attestation));
}
main().catch(()=>{console.error('Neon backup verification failed; production migration must not proceed.');process.exitCode=1;});
