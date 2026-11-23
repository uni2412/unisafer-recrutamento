import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
const origin='https://uni2412.github.io';
const env={RESEND_API_KEY:'test-not-a-secret',MAIL_FROM:'Unisafer <candidaturas@unisafereducacional.com.br>',TURNSTILE_SECRET_KEY:'fake',ALLOWED_ORIGINS:origin};
function candidate(){
  const keys=['nome','email','telefone','cidade','experiencia','inicio','dedicacao','motivacao','responsabilidade','aprendizado','organizacao','feedback','lead_sumiço','objecao','etica','sem_vendas','permanencia','treinamento','modelo','interesse','duvidas'];
  const a=Object.fromEntries(keys.map(k=>[k,'Exemplo de resposta para '+k]));
  Object.assign(a,{nome:'João da Silva',email:'joao@example.com',telefone:'11987654321'});
  return {answers:a,privacyAccepted:true,website:'',submissionId:'a5d535c5-f172-4c55-a842-4c451994fb7d',submittedAt:new Date().toISOString(),turnstileToken:'ok',pdfBase64:'JVBERi0'+('A'.repeat(512))};
}
function request(body=candidate(),from=origin,method='POST'){
 return new Request('https://unisafer-candidaturas.workers.dev/',{method,headers:{Origin:from,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
}
test('blocks unauthorized origins before API calls',async()=>{
 const r=await worker.fetch(request(candidate(),'https://evil.example'),env);
 assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('answers allowed preflight without exposing key',async()=>{
 const r=await worker.fetch(request(undefined,origin,'OPTIONS'),env);
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),origin);
});
test('valid candidate sends all 21 answers and PDF to correct inbox',async()=>{
 let calls=[];const orig=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('siteverify'))return new Response(JSON.stringify({success:true,action:'candidatura',hostname:'uni2412.github.io'}),{status:200});
  if(url.includes('api.resend.com'))return new Response(JSON.stringify({id:'x'}),{status:200});
  throw new Error('unexpected fetch');
 };
 try{
  const r=await worker.fetch(request(),env);const data=await r.json();
  assert.equal(r.status,200);assert.equal(data.ok,true);assert.equal(calls.length,2);
  const body=JSON.parse(calls[1].options.body);
  assert.deepEqual(body.to,['contato@unisafereducacional.com.br']);
  assert.equal(body.reply_to,'joao@example.com');
  assert.match(body.attachments[0].filename,/joao-da-silva/);
  assert.equal(body.attachments[0].content,candidate().pdfBase64);
  for (const k of Object.keys(candidate().answers))assert.ok(body.text.includes(candidate().answers[k]),k);
 }finally{globalThis.fetch=orig;}
});
test('rejected turnstile does not send email',async()=>{
 const orig=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({success:false}),{status:200});};
 try{const r=await worker.fetch(request(),env);assert.equal(r.status,403);assert.equal(count,1);}
 finally{globalThis.fetch=orig;}
});
test('Resend failure does not mark candidature as complete',async()=>{
 const orig=globalThis.fetch;
 globalThis.fetch=async(url)=>url.includes('siteverify')
  ? new Response(JSON.stringify({success:true,action:'candidatura',hostname:'uni2412.github.io'}))
  : new Response(JSON.stringify({message:'server error'}),{status:500});
 try{const r=await worker.fetch(request(),env);assert.equal(r.status,502);assert.equal((await r.json()).ok,false);}
 finally{globalThis.fetch=orig;}
});
