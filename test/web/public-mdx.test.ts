import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { evaluate } from '@mdx-js/mdx'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as runtime from 'react/jsx-runtime'

test('a página inicial oferece acesso e cadastro quando o SSO está disponível', async () => {
  const source = await readFile(new URL('../../src/content/public/landing.mdx', import.meta.url), 'utf8')
  const { default: Landing } = await evaluate(source, { ...runtime, baseUrl: import.meta.url })
  const html = renderToStaticMarkup(createElement(Landing, {
    authUrl: 'https://auth.avilaops.com/login',
    signupUrl: 'https://auth.avilaops.com/signup',
    checking: false,
  }))
  assert.ok(html.includes('href="https://auth.avilaops.com/login"'))
  assert.ok(html.includes('href="https://auth.avilaops.com/signup"'))
  assert.ok(!html.includes('indisponível'))
})
