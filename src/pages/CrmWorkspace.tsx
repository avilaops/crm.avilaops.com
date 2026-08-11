import { useEffect, useState } from 'react'
import AccountSelect from '../components/layout/AccountSelect'
import Copilot from '../components/layout/Copilot'
import Sidebar from '../components/layout/Sidebar'
import KnowledgeModal from '../components/modals/KnowledgeModal'
import LeadSourceModal, { type LeadSource } from '../components/modals/LeadSourceModal'
import SettingsShell from './settings/SettingsPages'
import Workspace from './workspace/WorkspacePages'
import type { Page, Screen } from '../types'
export type { Page } from '../types'

type CrmWorkspaceProps = {
  initialPage: Page
  onPageChange: (page: Page) => void
}

function CrmWorkspace({ initialPage, onPageChange }: CrmWorkspaceProps) {
  const [screen, setScreen] = useState<Screen>('accounts')
  const [page, setPageState] = useState<Page>(initialPage)
  const [leadSourceModal, setLeadSourceModal] = useState<LeadSource | null>(null)
  const [knowledgeModal, setKnowledgeModal] = useState(false)

  useEffect(() => {
    setPageState(initialPage)
  }, [initialPage])

  const setPage = (nextPage: Page) => {
    setPageState(nextPage)
    onPageChange(nextPage)
  }

  if (screen === 'accounts') {
    return <AccountSelect onEnter={() => setScreen('app')} />
  }

  const inSettings =
    page.includes('settings') ||
    page === 'billing' ||
    page === 'users' ||
    page === 'knowledge' ||
    page === 'integrations' ||
    page === 'lead-sources' ||
    page === 'channels'

  return (
    <main className="min-h-screen bg-[#f3f3f3] text-slate-800">
      <div className="grid min-h-screen grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_320px]">
        <Sidebar page={page} setPage={setPage} />
        <section className="min-w-0 border-r border-slate-200">
          {inSettings ? (
            <SettingsShell page={page} setPage={setPage} openKnowledge={() => setKnowledgeModal(true)} />
          ) : (
            <Workspace page={page} setPage={setPage} openLeadSource={setLeadSourceModal} />
          )}
        </section>
        <Copilot />
      </div>
      {leadSourceModal && (
        <LeadSourceModal
          source={leadSourceModal}
          onClose={() => setLeadSourceModal(null)}
          onConnected={() => undefined}
        />
      )}
      {knowledgeModal && <KnowledgeModal onClose={() => setKnowledgeModal(false)} />}
    </main>
  )
}

export default CrmWorkspace
