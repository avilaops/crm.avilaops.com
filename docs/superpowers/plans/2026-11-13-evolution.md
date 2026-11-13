# Finalizar WhatsApp Web pela Evolution API

Objetivo: ligar outro número ao tenant do CRM local, usando estado e QR reais da Evolution v2.3.7. O usuário escolheu outro número e pediu QR como padrão para todos os cadastros.

- [x] Cliente Evolution com timeout, credencial somente no backend e falhas reais no envio.
- [x] Rotas autenticadas de estado e pareamento; vínculo explícito de tenant e instância.
- [x] Sincronização idempotente das mensagens recentes para contatos e inbox, sem alterar webhooks de outras aplicações.
- [x] Tela para estado, QR real e sincronização no CRM.
- [x] Configurar acesso privado à API instalada no applications e verificar a instância escolhida.
- [ ] Testes e revisão; não enviar mensagens de teste nem desconectar a instância existente.

Decisão: o código legado desativava QR e simulava sucesso de envio offline. A solicitação atual autoriza retomar o WhatsApp Web; essas simulações serão removidas. Para o CRM local, a sincronização consulta a Evolution por túnel SSH, sem substituir o webhook de serviços existentes.

Atualização de escopo: uma instância determinística por empresa, compartilhada pelos usuários autorizados daquela empresa; empresas distintas não compartilham o pareamento. A conexão por QR é a opção principal da tela. Sincronização automática de textos recentes a cada 15 segundos, sem envio de mensagens automático.

Evidências: 7 testes específicos de Evolution aprovados, teste de ativação por canal real e teste móvel no Chrome aprovado. Revisão corrigiu estado e contagem de não lidas, SSE para novas conversas, reconexão automática e preservação de nomes existentes. Gravação de mensagens e estado do inbox ocorre na mesma transação; SSE é emitido após commit. A instância `crm_c94252fdb204451280cb52d522269e1e` foi criada para novo pareamento; `status` permaneceu aberta. Chaves configuradas sem exposição no frontend ou nos logs.

Pendente externo: o proprietário precisa escanear o QR para concluir o pareamento. A criação da instância não comprova conexão com o número.
