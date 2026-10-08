import { api } from './crm'

/**
 * Importação de contatos por arquivo (CSV e vCard). O arquivo é lido como texto
 * no navegador e enviado ao servidor, que normaliza telefone e e-mail e decide
 * o que é novo, o que já existe e o que não dá para importar.
 */

export type ImportField = 'name' | 'phone' | 'email' | 'company' | 'tags'
export type ImportMapping = Partial<Record<ImportField, number>>
export type LegalBasis = 'contrato' | 'consentimento' | 'legitimo_interesse'

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  company: 'Empresa',
  tags: 'Etiquetas',
}

export const LEGAL_BASIS_OPTIONS: { value: LegalBasis; label: string; hint: string }[] = [
  { value: 'contrato', label: 'São meus clientes', hint: 'Já compraram ou contrataram: o contato serve para cumprir o que foi combinado.' },
  { value: 'consentimento', label: 'Pediram para receber contato', hint: 'Deixaram o telefone ou o e-mail num formulário, cadastro ou evento, sabendo para quê.' },
  { value: 'legitimo_interesse', label: 'Tenho interesse legítimo', hint: 'Relação anterior com a empresa, sem pedido expresso.' },
]

export type ImportRejection = { line: number; reason: string; raw: string }

export type ImportPreview = {
  kind: 'csv' | 'vcard'
  columns: string[]
  mapping: ImportMapping
  sample: string[][]
  totals: { rows: number; novos: number; jaExistem: number; repetidosNoArquivo: number; invalidos: number } | null
  rejected?: ImportRejection[]
}

export type ImportResult = {
  importId: string
  undoUntil: string
  summary: { created: number; updated: number; kept: number; skipped: number; invalid: number; repeatedInFile: number }
  rejected: ImportRejection[]
}

export type ImportHistoryItem = {
  id: string
  file_name: string
  source_kind: 'csv' | 'vcard'
  legal_basis: LegalBasis
  origin_note: string
  created_count: number
  updated_count: number
  skipped_count: number
  invalid_count: number
  created_at: string
  undone_at: string | null
  user_name: string | null
  can_undo: boolean
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function previewContactImport(input: { fileName: string; content: string; mapping?: ImportMapping }) {
  return api<ImportPreview>('/api/contacts/import/preview', json(input))
}

export function runContactImport(input: {
  fileName: string
  content: string
  mapping: ImportMapping
  legalBasis: LegalBasis
  originNote: string
  onDuplicate: 'update' | 'keep'
  tags: string[]
}) {
  return api<ImportResult>('/api/contacts/import', json(input))
}

export function listContactImports() {
  return api<{ imports: ImportHistoryItem[] }>('/api/contacts/imports')
}

export function undoContactImport(id: string) {
  return api<{ removed: number; keptInUse: number; updatedNotReverted: number }>(`/api/contacts/imports/${id}/undo`, json({}))
}

/** Arquivo de erros para a pessoa corrigir e importar de novo. */
export function rejectionsToCsv(rejected: ImportRejection[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  return ['﻿linha;motivo;conteudo', ...rejected.map((item) => [item.line, escape(item.reason), escape(item.raw)].join(';'))].join('\r\n')
}

/**
 * Planilha salva pelo Excel em português costuma vir em Windows-1252. Ler como
 * UTF-8 trocaria "João" por "Jo�o"; quando isso aparece, lê de novo no outro.
 */
export async function readTextFile(file: File) {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8
}
