'use client';
import {useFormStatus} from 'react-dom';
import {TrackedButton} from './tracked-controls';
export function MonitorButton({active,disabled=false}:{active:boolean;disabled?:boolean}){const {pending}=useFormStatus();return <TrackedButton event="monitor_toggle_clicked" className={active?'secondary compact':'compact'} disabled={disabled||pending} aria-pressed={active}>{pending?'Saving…':active?'✓ Monitoring':'+ Monitor'}</TrackedButton>;}
