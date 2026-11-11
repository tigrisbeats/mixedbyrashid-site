import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutHandler } from '../netlify/functions/create-checkout.mjs';
import { checkoutReadiness } from '../netlify/lib/checkout-readiness.mjs';

const payment = {context:'production', mode:'live', checkoutEnabled:true, checkoutConfigured:true,
  webhookEnabled:true, webhookConfigured:true, secretKey:'unused'};
const storage = {enabled:true, configured:true};
const site = 'https://studio.example.test';
const request = (body, origin = site) => new Request(site + '/api/create-checkout', {
  method:'POST', headers:{'content-type':'application/json', ...(origin ? {origin} : {})}, body:JSON.stringify(body),
});
function setup(overrides = {}) {
  const calls = [];
  const handler = createCheckoutHandler({
    runtimeConfig:() => payment, storageConfig:() => storage, audioEnabled:() => true,
    createSession:async (_key, params) => {
      calls.push(params);
      return {id:'cs_live_unit_test', url:'https://checkout.stripe.com/c/pay/cs_live_unit_test', livemode:true};
    }, ...overrides,
  });
  return {handler, calls};
}

test('no checkout sessions without payment verification and private audio storage', async () => {
  for (const field of ['checkoutEnabled','webhookEnabled','webhookConfigured']) {
    const {handler, calls} = setup({runtimeConfig:() => ({...payment, [field]:false})});
    assert.equal((await handler(request({service:'studio',hours:2}))).status,503);
    assert.equal(calls.length,0);
  }
  for (const config of [{enabled:false,configured:true},{enabled:true,configured:false}]) {
    const {handler,calls} = setup({storageConfig:() => config});
    assert.equal((await handler(request({service:'mixing',quantity:1,email:'artist@example.test'}))).status,503);
    assert.equal(calls.length,0);
    assert.equal((await handler(request({service:'studio',hours:2}))).status,200);
  }
  assert.equal(checkoutReadiness({...payment,context:'branch-deploy'},storage,true).checkout_ready,false);
  assert.equal(checkoutReadiness({...payment,context:'deploy-preview'},storage,true).checkout_ready,false);
  assert.equal(checkoutReadiness({...payment,context:'deploy-preview',mode:'test',checkoutConfigured:false},storage,true).checkout_ready,false);
  assert.equal(checkoutReadiness(payment,storage,false).audio_orders_ready,false);
});

test('live hosted links keep checkout available with verification and use the Stripe quantity selector', async () => {
  const {handler,calls} = setup({runtimeConfig:() => ({...payment,checkoutConfigured:false})});
  for (const [body, price, host] of [
    [{service:'studio',hours:2},6000,'book.stripe.com'],
    [{service:'mixing',quantity:1,email:'artist@example.test'},5000,'buy.stripe.com'],
    [{service:'mastering',quantity:1,email:'artist@example.test'},2000,'buy.stripe.com'],
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status,200);
    const data = await response.json();
    const url = new URL(data.checkout_url);
    assert.equal(data.provider,'payment_link');
    assert.equal(data.mode,'live');
    assert.equal(data.amount_cents,price);
    assert.equal(url.hostname,host);
    if (body.email) assert.equal(url.searchParams.get('prefilled_email'),body.email);
  }
  assert.equal((await handler(request({service:'mixing',quantity:2,email:'artist@example.test'}))).status,400);
  assert.equal(calls.length,0);
});

test('checkout calculates the approved charges and paid-order details on the server', async () => {
  for (const [body, amount, revisions] of [
    [{service:'mixing',quantity:3,email:'artist@example.test',amount:1},15000,'2'],
    [{service:'mastering',quantity:2,email:'artist@example.test',amount:1},4000,'1'],
    [{service:'studio',hours:2,amount:1},6000,undefined],
    [{service:'studio',hours:12,amount:1},18000,undefined],
  ]) {
    const {handler,calls} = setup();
    const response = await handler(request(body));
    assert.equal(response.status,200);
    assert.equal((await response.json()).amount_cents,amount);
    const [params] = calls;
    assert.equal(params.line_items[0].price_data.unit_amount,amount);
    assert.equal(params.metadata.service,body.service);
    assert.equal(params.metadata.included_revisions,revisions);
    assert.deepEqual(params.payment_intent_data.metadata,params.metadata);
    assert.equal(params.customer_email,body.email);
    assert.match(params.success_url,/session_id=\{CHECKOUT_SESSION_ID\}/);
    if (body.service === 'studio') assert.equal(params.metadata.session_total_cents,String(body.hours*6000));
  }
});

test('invalid orders and cross-origin requests cannot reach Stripe', async () => {
  const {handler,calls} = setup();
  for (const origin of [null,'https://unrelated.example.test']) {
    assert.equal((await handler(request({service:'studio',hours:2},origin))).status,403);
  }
  for (const body of [null, [], {service:'unknown'}, {service:'studio',hours:1}, {service:'studio',hours:13},
    {service:'mixing',quantity:1}, {service:'mixing',quantity:1,email:'bad'},
    ...[0,-1,1.5,51,true].map(quantity=>({service:'mixing',quantity,email:'artist@example.test'}))]) {
    assert.equal((await handler(request(body))).status,400);
  }
  assert.equal(calls.length,0);
});

test('Stripe failures and wrong modes are never returned as checkout links', async () => {
  for (const createSession of [
    async () => ({id:'cs_test_wrong',url:'https://checkout.stripe.com/wrong',livemode:false}),
    async () => { throw Object.assign(new Error('sensitive provider response'),{type:'StripePermissionError',statusCode:403}); },
  ]) {
    const {handler} = setup({createSession});
    const response = await handler(request({service:'studio',hours:2}));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(), {error:'Unable to open secure checkout. Please try again shortly.'});
  }
});
