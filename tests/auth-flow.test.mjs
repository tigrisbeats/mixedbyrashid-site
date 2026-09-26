import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('signup sends unconfirmed users to verification instructions',()=>{
  const signup=read('netlify/functions/portal-signup.mjs');
  assert.match(signup,/\/verify-email\?sent=1/);
});

test('home forwards confirmation callbacks to verification page',()=>{
  const home=read('index.html');
  assert.match(home,/confirmation_token/);
  assert.match(home,/location\.replace\('\/verify-email'/);
});

test('verification page tells users where to look for the email',()=>{
  const page=read('verify-email.html');
  assert.match(page,/Check your email/i);
  assert.match(page,/Spam/);
  assert.match(page,/Junk/);
  assert.match(page,/Promotions/);
  assert.match(page,/handleAuthCallback/);
});

test('booking page contains no known mojibake markers',()=>{
  const page=read('booking.html');
  for(const marker of ['â','Â','Ã']){
    assert.equal(page.includes(marker),false,`booking.html still contains ${marker}`);
  }
});
