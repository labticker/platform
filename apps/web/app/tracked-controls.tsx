'use client';
import type {ComponentProps} from 'react';
import type {EventName} from '@labticker/analytics';
import {captureUiEvent} from './analytics';
type UiEvent=Exclude<EventName,'$pageview'>;
/** Fixed coarse event names only; controls never inspect input/form values or destinations. */
export function TrackedButton({event,onClick,...props}:ComponentProps<'button'>&{event:UiEvent}){
 return <button {...props} onClick={e=>{captureUiEvent(event);onClick?.(e);}}/>;
}
export function TrackedLink({event,onClick,...props}:ComponentProps<'a'>&{event:UiEvent}){
 return <a {...props} onClick={e=>{captureUiEvent(event);onClick?.(e);}}/>;
}
