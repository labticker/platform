import {getCurrentUser} from '../../lib/auth';
import {getDatabase} from '@labticker/database/runtime';
import {readSummary} from '@labticker/reporting/reader';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Admin(){
 const user=await getCurrentUser();if(!user)redirect('/auth/sign-in');if(user.role!=='admin')return <main><h1>Access denied</h1></main>;
 const to=new Date(Date.now()-86400000).toISOString().slice(0,10),from=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 const report=await readSummary(getDatabase(),{from,to,offset:0,limit:500});
 return <main><h1>LabTicker product metrics</h1><p>UTC report: {from} through {to}. Counts below ten are omitted. Activation counts use verified cohorts matured seven days; retention uses state at day 30. Cohorts without a recorded verification baseline are excluded and counted as unmeasured.</p><p>Reported opens are unreliable estimates because of Apple MPP and proxies. Clicks can include link scanners. No metric declares product-market fit or enables advertising.</p><table><thead><tr><th>Date</th><th>Metric</th><th>Count</th></tr></thead><tbody>{report.rows.map(row=><tr key={`${row.date}/${row.metric}`}><td>{row.date}</td><td>{row.metric}</td><td>{row.value}</td></tr>)}</tbody></table>{!report.rows.length&&<p>No reportable aggregate cells yet. Materialize complete UTC dates in the worker; unavailable or suppressed cells are not zero.</p>}<p>Acquisition visits require the configured PostHog project. No browser-to-account identity matching is performed. Rates require complete paired denominators and are not inferred from suppressed counts.</p></main>;
}
