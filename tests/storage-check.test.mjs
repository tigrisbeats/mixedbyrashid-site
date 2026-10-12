import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStorage } from '../netlify/lib/storage-check.mjs';
import { createStorageCheckHandler } from '../netlify/functions/admin-storage-check.mjs';

const runtime = { configured: true, enabled: false, appKey: 'public-id', appSecret: 'secret-marker', refreshToken: 'refresh-marker' };
test('storage check proves file round trip and confines cleanup to generated test folder', async () => {
  const calls = [];
  let content;
  const result = await checkStorage(runtime, async (url, options) => {
    calls.push({url, options});
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'access-marker' });
    if (url.endsWith('/files/upload')) { content = options.body; return Response.json({}); }
    if (url.endsWith('/files/download')) return new Response(content);
    if (url.endsWith('/files/list_folder')) return Response.json({entries:[{name:'check.txt'}]});
    if (url.endsWith('/files/get_temporary_link')) return Response.json({link:'https://example.com/private'});
    if (url.endsWith('/file_requests/create')) return Response.json({id:'request-id',is_open:false});
    return Response.json({});
  });
  assert.equal(result.ok, true);
  assert.equal(result.storage_enabled, false);
  const created = JSON.parse(calls.find(c=>c.url.endsWith('/files/create_folder_v2')).options.body).path;
  const deleted = JSON.parse(calls.find(c=>c.url.endsWith('/files/delete_v2')).options.body).path;
  assert.match(created, /^\/MixedByRashid Storage Check [0-9a-f-]{36}$/);
  assert.equal(deleted,created);
  assert.equal(JSON.parse(calls.find(c=>c.url.endsWith('/file_requests/create')).options.body).open,false);
  assert.doesNotMatch(JSON.stringify(result),/secret-marker|refresh-marker|access-marker|example.com/);
});
test('storage check cleans up failed uploads and reports cleanup failure honestly', async () => {
  for (const failCleanup of [false,true]) {
    const calls=[];
    const result=await checkStorage(runtime,async(url)=>{
      calls.push(url);
      if(url.endsWith('/oauth2/token'))return Response.json({access_token:'token'});
      if(url.endsWith('/files/upload') || (failCleanup && url.endsWith('/files/delete_v2')))return new Response('private provider details',{status:403});
      return Response.json({});
    });
    assert.equal(result.ok,false);
    assert.equal(result.checks.upload,false);
    assert.equal(result.checks.cleanup,!failCleanup);
    assert(calls.some(url=>url.endsWith('/files/delete_v2')));
    assert.doesNotMatch(JSON.stringify(result),/private provider details/);
  }
});
test('storage check rejects unauthenticated, non-owner and cross-origin requests before provider access',async()=>{
  let checks=0;
  const check=async()=>{checks++;return {ok:true}};
  const url='https://mixedbyrashid.netlify.app/api/admin-storage-check';
  const request=origin=>new Request(url,{method:'POST',headers:{Origin:origin}});
  const unauthorized=createStorageCheckHandler({user:async()=>{throw Object.assign(new Error('Authentication required'),{statusCode:401})},check});
  assert.equal((await unauthorized(request('https://mixedbyrashid.netlify.app'))).status,401);
  const client=createStorageCheckHandler({user:async()=>({id:'client'}),admin:()=>false,check});
  assert.equal((await client(request('https://mixedbyrashid.netlify.app'))).status,403);
  const owner=createStorageCheckHandler({user:async()=>({id:'owner'}),admin:()=>true,runtime:()=>runtime,check});
  assert.equal((await owner(request('https://unrelated.example'))).status,403);
  assert.equal(checks,0);
  assert.equal((await owner(request('https://mixedbyrashid.netlify.app'))).status,200);
  assert.equal(checks,1);
});
