'use client';
import {useState,useRef} from 'react';
import {captureUiEvent} from './analytics';
type Entry={slug:string;name:string;summary:string;category:string;website:string;aliases?:string[];provenance:string;releaseSources:{kind:string}[]};
export default function Catalog({services}:{services:Entry[]}){
 const [search,setSearch]=useState('');const [category,setCategory]=useState('all');
 const searched=useRef(false);
 function changeSearch(value:string){setSearch(value);if(!value.trim()){searched.current=false;return;}if(!searched.current){searched.current=true;captureUiEvent('catalog_search_used');}}
 const visible=services.filter(s=>(category==='all'||s.category===category)&&[s.name,s.summary,...s.aliases??[]].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <section aria-labelledby="catalog-title"><div className="catalog-head"><h2 id="catalog-title">Your software, together.</h2><span>{services.length} catalog entries</span></div><div className="filters"><label>Find an application<input type="search" value={search} onChange={e=>changeSearch(e.target.value)} placeholder="Search applications…"/></label><label>Category<select value={category} onChange={e=>{setCategory(e.target.value);captureUiEvent('catalog_filter_used');}}><option value="all">All categories</option>{[...new Set(services.map(s=>s.category))].sort().map(c=><option key={c}>{c}</option>)}</select></label></div><p aria-live="polite">{visible.length} applications</p><div className="grid">{visible.map(s=><article key={s.slug}><small>{s.category}</small><h3><a href={s.website} rel="noreferrer">{s.name} ↗</a></h3><p>{s.summary}</p><p className="source">{s.releaseSources.length?'Release source configured · polling not active':'No supported release source'}</p><details><summary>Catalog provenance</summary><code>{s.provenance}</code><p>Independently curated JSON; upstream project linked above.</p></details></article>)}</div>{!visible.length&&<p>No applications match. Try another name or category.</p>}</section>;
}
