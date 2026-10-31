'use client';
export default function AnalyticsControl(){return <div><p>Turn off optional web measurement for this browser. This saves a preference cookie containing no identifier.</p><button onClick={()=>{document.cookie='labticker_analytics=off; Path=/; Max-Age=31536000; SameSite=Lax; Secure';window.location.reload();}}>Disable optional analytics</button></div>;}
