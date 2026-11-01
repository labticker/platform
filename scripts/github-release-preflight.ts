import {GitHubReleasesAdapter,SafeHttpClient} from '../packages/releases/src/index.js';
// Public upstream data only. Do not log credentials, token structure or response bodies.
async function main(){
 const adapter=new GitHubReleasesAdapter(new SafeHttpClient({allowedHosts:['api.github.com'],githubToken:process.env.GITHUB_RELEASE_BOOTSTRAP_TOKEN,maxBytes:8388608}),undefined,1,'recent-window',20);
 const result=await adapter.fetchReleases({kind:'github-releases',repository:'jellyfin/jellyfin',channel:'stable'},{});
 if(result.status!=='modified'||!result.releases.length)throw new Error('No stable releases');
 console.log(JSON.stringify({preflight:'public-github-release',accepted:true,stableReleases:result.releases.length}));
}
main().catch(()=>{console.error('Public GitHub release preflight failed; no credentials or upstream bodies logged');process.exitCode=1;});
