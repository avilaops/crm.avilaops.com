import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PriceSummary, PriceTable, CostSimulator } from '../../src/components/whatsapp/Pricing'
import { tabelasWhatsApp } from '../../src/data/whatsappPricing'

test('preços sem comprovação oficial não aparecem na tela nem no simulador', () => {
  for (const component of [PriceSummary, PriceTable, CostSimulator]) {
    const html = renderToStaticMarkup(createElement(component, { tabela: tabelasWhatsApp[0] }))
    assert.match(html, /aguardam conferência/)
    assert.doesNotMatch(html, /R\$|87,50|vigente desde|input/)
  }
});
