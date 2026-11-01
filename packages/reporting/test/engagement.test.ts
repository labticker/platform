import {test} from 'node:test';import assert from 'node:assert/strict';
import {engagedCohortCounts} from '../src/cohorts.js';
type Account=Parameters<typeof engagedCohortCounts>[0][number];type State=Parameters<typeof engagedCohortCounts>[1][number];
test('day-thirty engagement waits for the full 23–37 window and never equates subscription state with engagement',()=>{
 const verified=new Date('2026-01-01T12:00Z'),start=new Date('2026-01-01'),end=new Date('2026-01-02');
 const accounts=['engaged','still-subscribed','too-early','too-late','unmeasured'].map(id=>({id,emailVerified:verified} as Account));
 const events:State[]=accounts.filter(a=>a.id!=='unmeasured').map(a=>({userId:a.id,eventType:'verified_signup',occurredAt:verified} as State));
 for(const [userId,day] of [['engaged',23],['too-early',22],['too-late',38],['unmeasured',30]] as const)events.push({userId,eventType:'dashboard_login',occurredAt:new Date(verified.getTime()+day*86400000)} as State);
 events.push({userId:'still-subscribed',eventType:'monitor_added',occurredAt:new Date('2026-02-01'),consented:true,enabled:true,activeMonitorCount:3} as State);
 assert.deepEqual(engagedCohortCounts(accounts,events,start,end,new Date('2026-02-07T11:59Z')),{engagedEligible:0,engagedDay30:0});
 assert.deepEqual(engagedCohortCounts(accounts,events,start,end,new Date('2026-02-09')),{engagedEligible:4,engagedDay30:1});
 events.push({userId:'too-late',eventType:'dashboard_login',occurredAt:new Date('2026-02-07T12:00Z')} as State);
 assert.deepEqual(engagedCohortCounts(accounts,events,start,end,new Date('2026-02-09')),{engagedEligible:4,engagedDay30:2});
});
