import {gaugeMetrics,metrics,rateDefinitions,type Metric} from './metrics.js';
export const completeMarkers=['report_complete','source_snapshot_complete'] as const;
export interface StoredAggregate {metricDate:string;metricName:string;dimensionKey:string;metricValue:number;computedAt:Date;}
type Value={available:true;value:number}|{available:false;reason:'missing_or_suppressed'|'incomplete_pair'};
function dates(from:string,to:string){const result:string[]=[];for(let time=Date.parse(from);time<=Date.parse(to);time+=86400000)result.push(new Date(time).toISOString().slice(0,10));return result;}
function completeRow(rows:readonly StoredAggregate[],metric:Metric,date:string){
 const value=rows.find(r=>r.metricDate===date&&r.metricName===metric&&r.dimensionKey==='all'&&Number.isSafeInteger(r.metricValue)&&r.metricValue>=0);
 const marker=rows.find(r=>r.metricDate===date&&r.metricName===(gaugeMetrics.has(metric)?'source_snapshot_complete':'report_complete')&&r.dimensionKey==='all'&&r.metricValue===1);
 return value&&marker&&value.computedAt.getTime()===marker.computedAt.getTime()?value:undefined;
}
function rawCount(rows:readonly StoredAggregate[],metric:Metric,from:string,to:string):number|null{
 if(gaugeMetrics.has(metric)){
  const latest=rows.filter(r=>r.metricName==='source_snapshot_complete'&&r.dimensionKey==='all'&&r.metricDate>=from&&r.metricDate<=to).map(r=>r.metricDate).sort().at(-1);
  const value=latest?completeRow(rows,metric,latest):undefined;return value?.metricValue??null;
 }
 let total=0;for(const date of dates(from,to)){const value=completeRow(rows,metric,date);if(!value)return null;total+=value.metricValue;}return total;
}
const shiftDate=(date:string,days:number)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
function ratesForWindow(rows:readonly StoredAggregate[],from:string,to:string,owner:boolean,availableFrom:string,availableTo:string,matureWindows=false){
 return rateDefinitions.map(definition=>{
  const maturityDays=definition.name==='activation'?7:definition.name==='retention_day30'?30:0;
  const lag=matureWindows?maturityDays:0,cohortFrom=shiftDate(from,-lag),cohortTo=shiftDate(to,-lag);
  const windowBasis=gaugeMetrics.has(definition.numerator)?'observed_snapshot' as const:lag?'maturity_date' as const:maturityDays?'signup_date_matured_subset' as const:'calendar_date' as const;
  const metadata={cohortFrom,cohortTo,windowFrom:from,windowTo:to,windowBasis,maturityLagDays:lag,asOf:null as {from:string;to:string}|null};
  if(cohortFrom<availableFrom||cohortTo>availableTo)return {...definition,...metadata,available:false as const,reason:'range_too_short' as const};
  const pairedDates=gaugeMetrics.has(definition.numerator)?rows.filter(row=>row.metricName==='source_snapshot_complete'&&row.dimensionKey==='all'&&row.metricDate>=cohortFrom&&row.metricDate<=cohortTo).map(row=>row.metricDate).sort().slice(-1):dates(cohortFrom,cohortTo);
  const watermarks:number[]=[];
  for(const date of pairedDates){
   const top=completeRow(rows,definition.numerator,date),bottom=completeRow(rows,definition.denominator,date);
   // Maturity-day windows require the entire signup day to have matured, not
   // merely a handful of early signups already eligible in an old partial run.
   const matureBy=Date.parse(date)+(lag+1)*86400000;
   if(!top||!bottom||top.computedAt.getTime()!==bottom.computedAt.getTime()||(lag>0&&top.computedAt.getTime()<matureBy))return {...definition,...metadata,available:false as const,reason:'incomplete_pair' as const};
   watermarks.push(top.computedAt.getTime());
  }
  const top=rawCount(rows,definition.numerator,cohortFrom,cohortTo),bottom=rawCount(rows,definition.denominator,cohortFrom,cohortTo);
  const asOf=watermarks.length?{from:new Date(Math.min(...watermarks)).toISOString(),to:new Date(Math.max(...watermarks)).toISOString()}:null;
  const valid=top!==null&&bottom!==null&&bottom>=10&&top<=bottom&&(owner||top>=10);
  return valid?{...definition,...metadata,asOf,available:true as const,value:top/bottom,numeratorCount:top,denominatorCount:bottom}:{...definition,...metadata,asOf,available:false as const,reason:'incomplete_pair' as const};
 });
}
function period(rows:readonly StoredAggregate[],from:string,to:string,owner:boolean){
 const totals=new Map(metrics.map(metric=>[metric,rawCount(rows,metric,from,to)]));
 const counts:Record<string,Value>=Object.fromEntries(metrics.map(metric=>{const value=totals.get(metric);return [metric,value!==null&&value!==undefined&&(owner||value>=10)?{available:true,value}:{available:false,reason:'missing_or_suppressed'}];}));
 const rates=ratesForWindow(rows,from,to,owner,from,to);
 return {from,to,counts,rates};
}
export function summarizePeriod(rows:readonly StoredAggregate[],from:string,to:string){return period(rows,from,to,false);}
export function summarizeOwnerPeriod(rows:readonly StoredAggregate[],from:string,to:string){return period(rows,from,to,true);}
function compare(rows:readonly StoredAggregate[],from:string,to:string,owner:boolean){
 return ([7,30] as const).map(days=>{
  const end=Date.parse(to),currentFrom=new Date(end-(days-1)*86400000).toISOString().slice(0,10),priorTo=new Date(end-days*86400000).toISOString().slice(0,10),priorFrom=new Date(end-(2*days-1)*86400000).toISOString().slice(0,10);
  if(priorFrom<from)return {days,available:false as const,reason:'range_too_short' as const};
  const current={...period(rows,currentFrom,to,owner),rates:ratesForWindow(rows,currentFrom,to,owner,from,to,true)},previous={...period(rows,priorFrom,priorTo,owner),rates:ratesForWindow(rows,priorFrom,priorTo,owner,from,to,true)};
  const comparisons=current.rates.map(metric=>{const prior=previous.rates.find(r=>r.name===metric.name);return metric.available&&prior?.available?{name:metric.name,available:true as const,percentagePointChange:(metric.value-prior.value)*100}:{name:metric.name,available:false as const,reason:'missing_or_suppressed' as const};});
  return {days,available:true as const,current,previous,comparisons};
 });
}
export function rollingComparisons(rows:readonly StoredAggregate[],from:string,to:string){return compare(rows,from,to,false);}
export function rollingOwnerComparisons(rows:readonly StoredAggregate[],from:string,to:string){return compare(rows,from,to,true);}
