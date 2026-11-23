// Cloudflare Worker: API do formulário Unisafer (GitHub Pages + Resend)
// Credenciais SOMENTE no painel Cloudflare > Worker > Settings > Variables and Secrets.
const FIELDS=[
 ['Nome completo','nome',90,true], ['E-mail','email',110,true], ['WhatsApp','telefone',35,true],
 ['Cidade e estado','cidade',110,true],['Experiência','experiencia',250,true],
 ['Disponibilidade de início','inicio',200,true],['Dedicação','dedicacao',200,true],
 ['Motivação','motivacao',1100,true],['Responsabilidade','responsabilidade',1400,true],
 ['Aprendizado','aprendizado',1300,true],['Organização','organizacao',1300,true],
 ['Feedback','feedback',1300,true],['Lead sem resposta','lead_sumiço',900,true],
 ['Objeção','objecao',900,true],['Ética','etica',900,true],
 ['Sem vendas','sem_vendas',1100,true],['Permanência','permanencia',950,true],
 ['Treinamentos','treinamento',100,true],
 ['Próximos passos','interesse',150,true],['Observações','duvidas',1000,false]
];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DESTINO='contato@unisafereducacional.com.br';
function answerError(reason){throw new Error(reason);}
function validate(data){
 if(!data||typeof data!=='object'||Array.isArray(data))answerError('Dados inválidos.');
 if(!UUID.test(data.submissionId||''))answerError('Identificador inválido.');
 if(data.website!=='')answerError('Envio rejeitado.');
 if(data.privacyAccepted!==true)answerError('Aceite o aviso de privacidade.');
 if(!data.turnstileToken||typeof data.turnstileToken!=='string'||data.turnstileToken.length>2048)answerError('Confirme o desafio de segurança.');
 const date=new Date(data.submittedAt);
 if(!Number.isFinite(date.getTime())||Math.abs(Date.now()-date.getTime())>86400000)answerError('Sessão expirada. Recarregue o formulário.');
 if(!data.answers||typeof data.answers!=='object'||Array.isArray(data.answers))answerError('Respostas inválidas.');
 let answers={};
 for(const [label,key,max,required] of FIELDS){
   let v=data.answers[key];if(v!==undefined&&typeof v!=='string')answerError('Campo inválido: '+label);
   v=String(v??'').trim();if(v.length>max)answerError('Resposta longa demais: '+label);
   if(required&&!v)answerError('Preencha: '+label);answers[key]=v;
 }
 if(answers.nome.length<4)answerError('Informe seu nome completo.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email))answerError('E-mail inválido.');
 if((answers.telefone.match(/\d/g)||[]).length<10)answerError('WhatsApp inválido.');
 if(typeof data.pdfBase64!=='string'||data.pdfBase64.length<100||data.pdfBase64.length>2100000||
    !/^JVBERi0[A-Za-z0-9+/=]*$/.test(data.pdfBase64))answerError('Arquivo PDF inválido.');
 return {answers,submissionId:data.submissionId.toLowerCase(),submittedAt:date.toISOString(),pdfBase64:data.pdfBase64,turnstileToken:data.turnstileToken};
}
function cleanFilename(name){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,55).toLowerCase()||'candidato';}
function response(payload,status,origin){return new Response(JSON.stringify(payload),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
 ...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'Content-Type'}:{})}});}
export default {
 async fetch(req,env){
   const origin=req.headers.get('Origin')||'';
   // A página oficial no GitHub Pages é autorizada mesmo se a variável opcional estiver ausente.
   // Outras origens precisam ser adicionadas explicitamente em ALLOWED_ORIGINS.
   const allowed=new Set(['https://uni2412.github.io',...(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)]);
   if(!origin||!allowed.has(origin))return response({ok:false,error:'Origem não autorizada.'},403,null);
   if(req.method==='OPTIONS')return response({ok:true},200,origin);
   if(req.method!=='POST')return response({ok:false,error:'Método não permitido.'},405,origin);
   if(!req.headers.get('content-type')?.includes('application/json'))return response({ok:false,error:'Formato inválido.'},415,origin);
   if(!env.RESEND_API_KEY||!env.MAIL_FROM||!env.TURNSTILE_SECRET_KEY)return response({ok:false,error:'Serviço ainda em configuração.'},503,origin);
   let p;
   try{const raw=await req.text();if(raw.length>2900000)throw new Error('Envio muito grande.');p=validate(JSON.parse(raw));}
   catch(err){return response({ok:false,error:err?.message||'Envio inválido.'},400,origin);}
   // O desafio é válido apenas para esta página e este tipo de envio.
   let check;
   try{
     const params=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:p.turnstileToken,
       remoteip:req.headers.get('CF-Connecting-IP')||''});
     const verify=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
       method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});
     check=await verify.json();
   }catch(_){return response({ok:false,error:'Não foi possível validar a verificação. Tente novamente.'},502,origin);}
   if(check?.success!==true||check.action!=='candidatura'||check.hostname!==new URL(origin).hostname)
     return response({ok:false,error:'Verificação expirada ou inválida. Confirme novamente.'},403,origin);
   const file='candidatura-'+cleanFilename(p.answers.nome)+'-'+p.submissionId.slice(0,8)+'.pdf';
   const text=[
     'Nova candidatura no formulário Unisafer',
     'Nome: '+p.answers.nome,'E-mail: '+p.answers.email,'WhatsApp: '+p.answers.telefone,
     'Cidade: '+p.answers.cidade,'Protocolo: '+p.submissionId,'Data: '+p.submittedAt,
     '', 'Todas as respostas também estão no PDF anexo.',
     ...FIELDS.map(([label,key])=>'\n'+label+'\n'+(p.answers[key]||'(não informado)'))
   ].join('\n');
   try{
     const email=await fetch('https://api.resend.com/emails',{
       method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,
       'Content-Type':'application/json','Idempotency-Key':'candidatura/'+p.submissionId},
       body:JSON.stringify({from:env.MAIL_FROM,to:[DESTINO],reply_to:p.answers.email,
         subject:'Nova candidatura Unisafer | '+p.answers.nome,
         text,attachments:[{filename:file,content:p.pdfBase64,content_type:'application/pdf'}]})
     });
     if(!email.ok){console.error('Resend recusou:',email.status);return response({ok:false,error:'Não foi possível confirmar o envio. Tente novamente.'},502,origin);}
     return response({ok:true,protocol:p.submissionId},200,origin);
   }catch(err){console.error('Falha de conexão com Resend',err?.name);return response({ok:false,error:'Erro no envio. Tente novamente.'},502,origin);}
 }
};
