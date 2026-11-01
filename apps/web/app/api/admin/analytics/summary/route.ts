import {getReportingDatabase} from '@labticker/database/runtime';
import {createSummaryHandler,readSummary} from '@labticker/reporting/reader';
export const dynamic='force-dynamic';
const handle=createSummaryHandler({secret:()=>process.env.ANALYTICS_REPORT_TOKEN,read:query=>readSummary(getReportingDatabase(),query),audit:event=>console.info(JSON.stringify(event))});
export const GET=handle;
