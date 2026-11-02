'use client';
import {useFormStatus} from 'react-dom';
export function EmailTestSubmit(){
 const {pending}=useFormStatus();
 return <button type="submit" disabled={pending}>{pending?'Queueing test digest…':'Send a test digest to my verified account email'}</button>;
}
