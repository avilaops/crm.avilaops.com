import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimarCustoMensal,
  formatarVigencia,
  precoEmReais,
  tabelaVigente,
  tabelasWhatsApp,
  type TabelaPrecosWhatsApp,
} from '../../src/data/whatsappPricing'
import { formatBRL, formatUnitPrice } from '../../src/lib/format'

const tabela = tabelaVigente(new Date('2026-10-02T12:00:00Z'))

test('a tabela vigente em outubro de 2026 é a de 01/10/2026, em reais', () => {
  assert.equal(tabela.vigenteDesde, '2026-10-01')
  assert.equal(tabela.moeda, 'BRL')
  assert.equal(formatarVigencia(tabela), '01/10/2026')
})

test('preços por mensagem entregue para o Brasil', () => {
  assert.equal(precoEmReais(tabela, 'marketing'), 0.3217)
  assert.equal(precoEmReais(tabela, 'utilidade'), 0.035)
  assert.equal(precoEmReais(tabela, 'autenticacao'), 0.035)
  assert.equal(precoEmReais(tabela, 'servico'), 0)
  assert.equal(tabela.franquiaServicoPorNumero, 0)
})

test('nenhum preço em dólar nem o "0,0002" que a tela antiga mostrava', () => {
  for (const item of tabelasWhatsApp) {
    assert.equal(item.moeda, 'BRL')
    for (const valor of Object.values(item.precoPorMensagem)) assert.notEqual(valor, 2)
  }
})

test('o exemplo da transportadora: 500 avisos e 3.000 respostas custam R$ 17,50 nos valores ainda provisórios', () => {
  const estimativa = estimarCustoMensal(tabela, { utilidade: 500, servico: 3000, marketing: 0 })
  assert.equal(estimativa.total, 17.5)
  assert.equal(formatBRL(estimativa.total), 'R$ 17,50')
  const servico = estimativa.linhas.find((linha) => linha.categoria === 'servico')
  assert.deepEqual(servico, { categoria: 'servico', mensagens: 3000, cobradas: 0, valor: 0 })
  assert.equal(estimativa.franquiaUsada, 0)
})

test('serviço é gratuito e não desconta categorias pagas', () => {
  const doisNumeros = estimarCustoMensal(tabela, { servico: 1500, utilidade: 0, marketing: 0, numeros: 2 })
  assert.equal(doisNumeros.franquia, 0)
  assert.equal(doisNumeros.total, 0)

  const marketing = estimarCustoMensal(tabela, { servico: 0, utilidade: 0, marketing: 1000 })
  assert.equal(marketing.total, 321.7)
})

test('a soma é feita em inteiros: 3 mensagens de R$ 0,035 dão R$ 0,105, sem resto de ponto flutuante', () => {
  const estimativa = estimarCustoMensal(tabela, { utilidade: 3, servico: 0, marketing: 0 })
  assert.equal(estimativa.total, 0.105)
})

test('entrada inválida do simulador vira zero, não NaN', () => {
  const estimativa = estimarCustoMensal(tabela, { utilidade: -10, servico: Number.NaN, marketing: 2.7 })
  assert.equal(estimativa.total, 0.6434)
  assert.ok(estimativa.linhas.every((linha) => Number.isFinite(linha.valor)))
})

test('a tabela vigente é a mais recente que já começou', () => {
  const antiga: TabelaPrecosWhatsApp = { ...tabela, vigenteDesde: '2026-07-01', precoPorMensagem: { ...tabela.precoPorMensagem, servico: 0 } }
  const futura: TabelaPrecosWhatsApp = { ...tabela, vigenteDesde: '2027-01-01' }
  const todas = [futura, tabela, antiga]
  assert.equal(tabelaVigente(new Date('2026-08-15T12:00:00Z'), todas).vigenteDesde, '2026-07-01')
  assert.equal(tabelaVigente(new Date('2026-12-31T12:00:00Z'), todas).vigenteDesde, '2026-10-01')
  assert.equal(tabelaVigente(new Date('2027-01-02T12:00:00Z'), todas).vigenteDesde, '2027-01-01')
  // Relógio atrasado: a mais antiga, nunca uma tela sem preço.
  assert.equal(tabelaVigente(new Date('2020-01-01T00:00:00Z'), todas).vigenteDesde, '2026-07-01')
})

test('preço unitário mostra até quatro casas', () => {
  assert.equal(formatUnitPrice(0.3217), 'R$ 0,3217')
  assert.equal(formatUnitPrice(0.035), 'R$ 0,035')
  assert.equal(formatBRL(0.3217), 'R$ 0,32')
})


test('utilidade na janela é gratuita e serviço não tem limite mensal', () => {
  const result = estimarCustoMensal(tabela, { servico: 1000000, utilidade: 500, utilidadeNaJanela: 400, marketing: 0 })
  assert.equal(result.total, 3.5)
  assert.equal(result.linhas.find(x => x.categoria === 'servico')?.cobradas, 0)
  assert.equal(tabela.conferidaNoCsvOficial, false)
})
