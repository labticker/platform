import './style.css';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'LabTicker — homelab releases',description:'Update your homelab. Without the homework.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
