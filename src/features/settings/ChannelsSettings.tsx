import { AtSign, Globe, Mail, MessageCircle, MessagesSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavRow } from '../../components/ui/Rows'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { ConnectionState } from '../../lib/connection'
import { listChannels } from '../../lib/crm'
import { getMailAccount } from '../../lib/mail'
import { getMessageriaStatus } from '../../lib/messageria'
import { useNavigation } from '../../lib/navigationContext'
import { describeWhatsAppConnection } from '../../lib/whatsappConnection'
import { SettingsFrame } from './SettingsFrame'

/**
 * Área de trabalho › Canais: por onde a conversa entra e sai.
 *
 * Canal é diferente de integração. Canal gera conversa na Caixa de entrada
 * (WhatsApp, e-mail); integração troca dados com outro sistema (ERP, n8n,
 * Google Agenda) e mora na Central de integrações. "Canais Meta" deixou de ser
 * item: o WhatsApp aparece aqui ao lado dos outros canais.
 */
export function ChannelsSettings() {
  const { navigate } = useNavigation()
  const [whatsapp, setWhatsapp] = useState<ConnectionState | null>(null)
  const [mail, setMail] = useState<ConnectionState | null>(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([getMessageriaStatus(), listChannels()]).then(([status, channels]) => {
      if (!active) return
      const view = describeWhatsAppConnection(
        status.status === 'fulfilled' ? status.value : null,
        channels.status === 'fulfilled' ? channels.value.channels : [],
      )
      setWhatsapp(status.status === 'rejected' && view.state === 'disconnected' ? 'error' : view.state)
    })
    getMailAccount()
      .then(({ account }) => active && setMail(!account ? 'disconnected' : account.lastError ? 'error' : 'connected'))
      .catch(() => active && setMail('error'))
    return () => {
      active = false
    }
  }, [])

  return (
    <SettingsFrame page="channels" title="Canais" description="Cada canal entrega as conversas na Caixa de entrada, com o mesmo histórico do cliente.">
      <div className="space-y-5">
        <section aria-label="Canais de conversa" className="rounded-xl border border-slate-200 bg-white p-2">
          <ul>
            <li>
              <NavRow
                icon={MessageCircle}
                title="WhatsApp"
                description="Conversas com clientes pela conexão oficial"
                trailing={whatsapp && <StatusBadge state={whatsapp} />}
                onClick={() => navigate('whatsapp-channel')}
              />
            </li>
            <li>
              <NavRow
                icon={Mail}
                title="E-mail"
                description="Caixa de entrada e envio da newsletter"
                trailing={mail && <StatusBadge state={mail} />}
                onClick={() => navigate('mail-settings')}
              />
            </li>
            <li>
              <NavRow icon={AtSign} title="Instagram e Messenger" description="Direct e mensagens da página" trailing={<StatusBadge state="soon" />} disabled />
            </li>
            <li>
              <NavRow icon={Globe} title="Chat do site" description="Um botão de conversa no seu site" trailing={<StatusBadge state="soon" />} disabled />
            </li>
          </ul>
        </section>

        <section aria-label="Atendimento" className="rounded-xl border border-slate-200 bg-white p-2">
          <NavRow
            icon={MessagesSquare}
            title="Regras de atendimento"
            description="Boas-vindas, ausência, distribuição e prazo de resposta"
            onClick={() => navigate('chat-settings')}
          />
        </section>
      </div>
    </SettingsFrame>
  )
}
