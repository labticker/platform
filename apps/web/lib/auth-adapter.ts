import type {Adapter} from 'next-auth/adapters';
/** Auth.js re-verifies an address on subsequent email logins. Its first verification
 * is also our signup cohort boundary and must remain stable across these updates.
 */
export function keepInitialVerification(adapter:Adapter):Adapter{
 if(!adapter.getUser||!adapter.updateUser)throw new Error('Required adapter operations unavailable');
 const getUser=adapter.getUser,updateUser=adapter.updateUser;
 return {...adapter,async updateUser(data){
  const existing=await getUser(data.id);
  return updateUser({...data,...(existing?.emailVerified?{emailVerified:existing.emailVerified}:{})});
 }};
}
