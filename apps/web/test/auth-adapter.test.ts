import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Adapter,AdapterUser} from 'next-auth/adapters';
import {keepInitialVerification} from '../lib/auth-adapter';
test('subsequent sign-ins preserve original signup cohort while first verification persists',async()=>{
 let user:AdapterUser={id:'fixture',email:'fixture@example.com',emailVerified:null};
 const storage:Adapter={getUser:async()=>user,updateUser:async data=>(user={...user,...data})};
 const adapter=keepInitialVerification(storage);
 const verifiedAt=new Date('2026-01-01T10:00:00Z');
 await adapter.updateUser!({id:user.id,emailVerified:verifiedAt});
 await adapter.updateUser!({id:user.id,emailVerified:new Date('2026-02-01T10:00:00Z'),name:'Changed name'});
 assert.equal(user.emailVerified?.toISOString(),verifiedAt.toISOString());
 assert.equal(user.name,'Changed name');
 assert.throws(()=>keepInitialVerification({}),/Required adapter/);
});
