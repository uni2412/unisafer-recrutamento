# Unisafer — GitHub Pages + Cloudflare Worker + Resend

## O que é este projeto
Site HTML com o mesmo visual do formulário Unisafer, publicado no GitHub Pages.
O navegador gera um PDF com o nome e **todas as 21 respostas**. Um Cloudflare Worker
valida os dados e o Turnstile, depois envia o arquivo para
**contato@unisafereducacional.com.br**, usando Resend. O PDF fica no e-mail; não há banco de dados nem armazenamento separado.

## Primeiro: publicar no GitHub Pages

1. Crie repositório público `unisafer-recrutamento` (GitHub Pages com GitHub Free exige público).
2. Faça upload de `index.html` e da pasta `assets/` na raiz. NÃO suba chaves ou credenciais.
3. Settings > Pages > Deploy from a branch > main > / (root) > Save.
4. A URL inicial será `https://SEU-USUARIO.github.io/unisafer-recrutamento/`.
5. Para domínio próprio: Pages > Custom domain `selecao.unisafereducacional.com.br`;
   no provedor DNS crie CNAME `selecao` para `SEU-USUARIO.github.io` (sem https ou caminho),
   aguarde verificação e ative Enforce HTTPS.

## Segundo: configurar Resend

1. Crie conta em https://resend.com e acesse Domains > Add Domain.
2. Verifique um domínio de envio que controle e adicione somente os registros **de envio** solicitados
   pela Resend. **Não substitua os MX do e-mail de recebimento da Unisafer.**
   Sugestão: verificar `unisafereducacional.com.br`, usar `candidaturas@unisafereducacional.com.br` como remetente.
3. Em API Keys, crie chave com permissão Sending access. Não copie a chave para GitHub ou HTML.

## Terceiro: criar Worker Cloudflare

1. Acesse https://dash.cloudflare.com > Workers & Pages > Create application > Worker.
2. Nome sugerido: `unisafer-candidaturas`. Abra `Edit code` e cole todo o conteúdo de
   `cloudflare/worker.mjs`. Salve / Deploy.
3. Copie URL `https://unisafer-candidaturas.SUA-CONTA.workers.dev`.
4. Em Settings > Variables and Secrets, configure:

   | Nome | Tipo | Valor |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | chave criada na Resend |
   | `MAIL_FROM` | Variable | `Unisafer Selecao <candidaturas@unisafereducacional.com.br>` |
   | `ALLOWED_ORIGINS` | Variable | `https://SEU-USUARIO.github.io,https://selecao.unisafereducacional.com.br` |
   | `TURNSTILE_SECRET_KEY` | Secret | chave secreta de Turnstile |

   Para fase inicial, configure apenas os domínios que de fato estejam publicados;
   `ALLOWED_ORIGINS` aceita origens separadas por vírgula, **sem barra final nem caminho**.

## Quarto: configurar Turnstile

1. Em Cloudflare > Turnstile > Add widget, crie `unisafer-recrutamento`.
2. Adicione os hostnames exatos `SEU-USUARIO.github.io` e, quando publicado,
   `selecao.unisafereducacional.com.br`.
3. Copie Site Key (pública) para o `index.html`; copie Secret Key (privada) para o Secret
   `TURNSTILE_SECRET_KEY` do Worker.

## Quinto: apontar o HTML para o Worker

Abra `index.html`, localize `window.UNISAFER_CONFIG` e substitua:

```js
window.UNISAFER_CONFIG = {
  workerUrl: "https://unisafer-candidaturas.SUA-CONTA.workers.dev",
  turnstileSiteKey: "SUA_SITE_KEY_PUBLICA"
};
```

Faça commit da alteração. **Nunca cole a chave secreta do Turnstile nem do Resend no HTML.**

## Sexto: teste de ponta a ponta

1. Abra o link público em HTTPS e preencha um candidato fictício.
2. Conclua o Turnstile e envie.
3. Aguarde a tela de confirmação com protocolo.
4. Confirme o e-mail com PDF anexo em contato@unisafereducacional.com.br.
5. Confira todas as respostas e o nome no arquivo; confira também Spam e Resend > Emails.
6. Se não chegar, veja Cloudflare Worker > Observability/Logs e Resend > Emails.

## Avisos

- O PDF é gerado no navegador e só é enviado ao Worker, não fica armazenado na Vercel/Supabase.
- O serviço de e-mail aceitar o envio **não garante entrega na caixa de entrada**. Confira Resend e Spam.
- Não armazene dados de candidatos no repositório. GitHub Pages é público.
- O formulário depende de conexão de rede para carregar jsPDF e Cloudflare Turnstile.
- O Worker verifica origem, campos, tamanho, honeypot e Turnstile no servidor, mas isso
  não substitui monitoramento e revisão de privacidade/LGPD.
- O Resend deduplica tentativas iguais por 24 horas; sem banco não há histórico de candidaturas
  fora da caixa de e-mail. Faça backup seguro do e-mail se quiser retenção longa.
- Ao trocar do domínio do GitHub para o domínio próprio, atualize `ALLOWED_ORIGINS` e
  os hostnames do Turnstile.
