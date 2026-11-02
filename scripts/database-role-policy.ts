import type {Sql} from 'postgres';
export const runtimeRoles=['labticker_web','labticker_worker','labticker_reports'] as const;
type Executor=Pick<Sql,'unsafe'>;
const identifier=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const grants:Record<typeof runtimeRoles[number],Record<string,readonly string[]>>={
 labticker_web:{
  'SELECT, INSERT, UPDATE, DELETE':['email_test_messages','auth_accounts','auth_sessions','verification_tokens','preferences','subscriptions'],
  'SELECT, INSERT, UPDATE':['users','email_consents','resend_webhook_events','digest_message_engagement'],
  'SELECT, INSERT':['account_state_events','catalog_changes','auth_email_messages'],

  'SELECT, UPDATE':['digests','release_sources'],
  SELECT:['applications','app_aliases','app_source_records','releases','digest_items','delivery_receipts','job_runs'],
 },
 labticker_worker:{
  'SELECT, UPDATE, DELETE':['email_test_messages'],
  'SELECT, UPDATE':['users','preferences'],
  'SELECT, INSERT, UPDATE':['applications','app_aliases','app_source_records','release_sources','releases','digests','digest_message_engagement','analytics_daily_aggregates','analytics_report_runs','job_runs'],
  'SELECT, INSERT':['catalog_changes','digest_items','delivery_receipts','account_state_events'],
  'SELECT, DELETE':['resend_webhook_events','auth_email_messages'],
  SELECT:['subscriptions','email_consents'],
 },
 labticker_reports:{SELECT:['analytics_daily_aggregates']},
};
/** Run only as migration owner on this dedicated application's database, after approval. */
export async function applyRuntimeRoleGrants(sql:Executor){
 await sql.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await sql.unsafe('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
 await sql.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC');
 for(const role of runtimeRoles){
  await sql.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${identifier(role)}`);
  await sql.unsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${identifier(role)}`);
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${identifier(role)}`);
  for(const [privileges,tables] of Object.entries(grants[role]))await sql.unsafe(`GRANT ${privileges} ON ${tables.map(name=>'public.'+identifier(name)).join(', ')} TO ${identifier(role)}`);
  if(role!=='labticker_reports')await sql.unsafe(`GRANT USAGE, SELECT ON SEQUENCE public.account_state_events_sequence_seq TO ${identifier(role)}`);
  await sql.unsafe(`ALTER ROLE ${identifier(role)} SET statement_timeout = '20s'`);
  // A source poll holds its lease across at most five bounded ten-second fetches.
  await sql.unsafe(`ALTER ROLE ${identifier(role)} SET idle_in_transaction_session_timeout = '${role==='labticker_worker'?'90s':'30s'}'`);
 }
 await sql.unsafe("ALTER ROLE labticker_reports SET default_transaction_read_only = 'on'");
}
