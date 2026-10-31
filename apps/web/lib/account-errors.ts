const safeMessages=new Set(['Verified account required','Application unavailable','No supported release source','Consent and unsuppressed account required','Invalid frequency','Invalid next due time']);
/** Web boundaries must not pass SQL errors, parameters or provider causes into framework logs. */
export async function guardAccount<T>(operation:()=>Promise<T>):Promise<T>{
 try{return await operation();}catch(error){
  const message=error instanceof Error&&safeMessages.has(error.message)?error.message:'Account operation unavailable';
  throw new Error(message);
 }
}
