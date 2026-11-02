import {EmailTestSubmit} from './email-test-submit';
import {randomUUID} from 'node:crypto';
import {emailTestMessage} from '../../lib/email-testing';
type TestHistoryEntry={id:string;status:string;createdAt:Date;sentAt:Date|null;deliveredAt:Date|null;bouncedAt:Date|null;complainedAt:Date|null};
function historyStatus(entry:TestHistoryEntry){
 if(entry.complainedAt)return 'Complaint received';
 if(entry.bouncedAt)return 'Bounced';
 if(entry.deliveredAt)return 'Delivered';
 if(entry.sentAt)return 'Accepted by email provider';
 return ({pending:'Queued',claimed:'Processing',failed:'Failed',skipped:'Skipped'} as Record<string,string>)[entry.status]??'Status unavailable';
}
export function EmailTestPanel({action,status,history}:{action:(data:FormData)=>Promise<void>;status?:string;history?:TestHistoryEntry[]|null}){
 const message=emailTestMessage(status);
 return <section className="panel" aria-labelledby="email-test-heading">
  <h2 id="email-test-heading">Private owner email test</h2>
  <p>Send one real test digest using stored releases from the applications you monitor. The server uses only your verified account email.</p>
  <p>This is separate from the sample preview and scheduled digest consent. Public email delivery remains disabled, and this test does not enable your digest schedule.</p>
  {message&&<p className="notice" role="status">{message}</p>}
  <form action={action}>
   <input type="hidden" name="requestId" value={randomUUID()}/>
   <label><input type="checkbox" name="testConsent" required/> I expressly consent to this one real test email to my verified account email.</label>
   <EmailTestSubmit/>
  </form>
  <h3>Recent private email tests</h3>
  <p className="muted">Refresh this page to check delivery. Provider acceptance does not confirm inbox delivery.</p>
  {history===null?<p>Test history is temporarily unavailable.</p>:history?.length?<ul>{history.map(entry=><li key={entry.id}>{new Date(entry.createdAt).toLocaleString('en-CA',{timeZone:'UTC'})} UTC · {historyStatus(entry)}</li>)}</ul>:<p>No private test emails have been requested yet.</p>}
 </section>;
}
