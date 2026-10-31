# Tracing de IA

O backend exporta observações para Langfuse por OpenTelemetry. A exportação é
opcional e vem desligada. O frontend nunca recebe as chaves.

## Configuração

Configure no gestor de segredos do ambiente de execução:

```dotenv
LANGFUSE_ENABLED=true
LANGFUSE_BASE_URL=https://seu-langfuse.example
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

Use Langfuse Cloud ou servidor próprio compatível com SDK JS v6 (v4.59.0 ou
posterior). Informe a origem HTTPS, sem `/api/public/otel/v1/traces`, credenciais,
query ou fragmento. Não use prefixo `VITE_`. Não coloque chaves no GitHub ou em
arquivos versionados. `LANGFUSE_TRACING_ENABLED=false` desliga a exportação.
Headers ambientais `OTEL_EXPORTER_OTLP_HEADERS` e
`OTEL_EXPORTER_OTLP_TRACES_HEADERS` impedem a inicialização, para preservar o
destino e as credenciais desta integração.

## Cobertura e privacidade

- `crm.ai.triagem`, `crm.ai.catalogo` e `crm.ai.campanha`: uma geração por chamada
  a `chat/completions`, incluindo falhas de HTTP, resposta vazia e JSON inválido.
- `crm.ai.teste-provedor`: geração do teste de configuração, inclusive HTTP
  recusado retornado como `ok: false`.
- `crm.ai.transcricao`: ferramenta de transcrição, incluindo retorno nulo e
  indisponibilidade. A API não informa o modelo; nenhum é inventado.

Cada observação registra duração, nome fixo, resultado e modelo quando conhecido.
Tokens de entrada/saída são os informados pelo provedor; valores ausentes ou
inválidos são omitidos. Não há estimativa de custo ou tokens.
Prompts, respostas, transcrições, áudio, contexto, URLs de provedor, chaves,
identificadores de empresa/usuário e erros brutos não são exportados. Input/output
contêm apenas indicadores de conteúdo omitido e estado. Upload de mídia,
instrumentação HTTP/SQL e descoberta ambiental de recursos estão desativados.
O filtro exporta apenas os seis nomes fixos desta integração. O registro local
existente em `ai_runs` continua independente do Langfuse.

Falhas da telemetria preservam resposta/erro e nunca repetem a chamada ao
provedor. Flush ao finalizar a chamada espera no máximo quatro segundos; o
exportador tem timeout de três segundos. O fechamento do Fastify e saída natural
fazem shutdown. SIGTERM/SIGINT encerram o servidor antes de sair; SIGKILL ou
interrupção do container antes do fechamento podem perder observações. O trabalho
de transcrição iniciado em segundo plano pelo webhook não é uma requisição
Fastify pendente e pode ser interrompido no desligamento.

## Validação

O workflow existente executa `npm run validate`, que inclui os testes de
`backend/test/langfuse.test.mjs`. O coletor HTTPS efêmero recebe OTLP real durante
o CI, com chamadas de provedor simuladas e sem credenciais externas. Os testes
verificam nomes, tipos, tokens, falhas e ausência dos marcadores privados.

A confirmação de ingestão no destino real exige configurar URL/chaves, publicar
com autorização e executar uma operação em ambiente de homologação. Abra o trace
no Langfuse e confira nomes, modelo, tokens e conteúdo omitido. O teste do coletor
não comprova conectividade, credenciais ou retenção do destino real.

Referências: [SDK](https://langfuse.com/docs/observability/sdk/overview) e
[boas práticas](https://langfuse.com/docs/observability/best-practices).
