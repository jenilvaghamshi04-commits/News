import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authentication} from '../server/auth.mjs';
test('signed login session rejects tampering and changes with password',()=>{
 const auth=authentication({username:'admin',password:'qa-test-password-123'}),token=auth.issue();
 assert.equal(auth.valid('bw_session='+token),true);
 assert.equal(auth.valid('bw_session='+token+'tampered'),false);
 assert.equal(auth.valid('bw_session=0.nonce.signature'),false);
 assert.equal(auth.credentials('admin','wrong'),false);
 assert.equal(auth.credentials('admin','qa-test-password-123'),true);
 assert.equal(authentication({username:'admin',password:'different-secret-456'}).valid('bw_session='+token),false);
 assert.match(auth.cookie(token),/HttpOnly; SameSite=Strict/);assert.match(auth.cookie(token),/Secure/);
});
