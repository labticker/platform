import { loadRegistry } from './index.js';
const records=await loadRegistry();
console.log(`Validated ${records.length} catalog definitions (${records.filter(x=>x.definition.releaseSources.length>0).length} monitorable).`);
