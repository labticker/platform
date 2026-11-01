import {cache} from 'react';
import {resolve} from 'node:path';
import {loadRegistry} from '@labticker/catalog';
import {getDatabase} from '@labticker/database/runtime';
import {readPublicCatalog} from '@labticker/database/public-catalog';
import type {CatalogEntry} from '../app/catalog-types';
import {accountDashboard} from '@labticker/database/accounts';
import {guardAccount} from './account-errors';
export const publicCatalog=cache(async():Promise<{entries:CatalogEntry[];mode:'database'|'preview'|'unavailable'}>=>{
 if(process.env.WEB_DATABASE_URL||process.env.DATABASE_URL){
  try{const entries=await readPublicCatalog(getDatabase());return {mode:'database',entries:entries.map(app=>({...app,monitored:false,lastSuccessfulPoll:app.lastSuccessfulPoll?.toISOString()??null,latest:app.latest?{...app.latest,publishedAt:app.latest.publishedAt?.toISOString()??null,firstSeenAt:app.latest.firstSeenAt.toISOString()}:null}))};}
  catch{/* Fall back to reviewed Git metadata, explicitly without tracking claims. */}
 }
 const mode=process.env.WEB_DATABASE_URL||process.env.DATABASE_URL?'unavailable':'preview';
 const records=await loadRegistry(resolve(process.cwd(),'../../catalog/services'));
 return {mode,entries:records.map(({definition:app})=>({id:null,slug:app.slug,name:app.name,summary:app.summary,category:app.category,website:app.website,repository:app.repository?.url??null,aliases:app.aliases??[],sourceState:app.releaseSources.length?mode:'unsupported',canMonitor:false,historyLimited:false,lastSuccessfulPoll:null,latest:null,monitored:false}))};
});
export async function catalogForAccount(userId?:string){
 const catalog=await publicCatalog();if(!userId||catalog.mode!=='database')return catalog;
 const state=await guardAccount(()=>accountDashboard(getDatabase(),userId));
 const monitored=new Set(state.monitors.filter(monitor=>monitor.active).map(monitor=>monitor.applicationId));
 return {...catalog,entries:catalog.entries.map(app=>({...app,monitored:!!app.id&&monitored.has(app.id)}))};
}
