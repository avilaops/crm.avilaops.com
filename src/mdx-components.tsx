import type { MDXComponents } from 'mdx/types'
import { PublicMdxComponents } from './components/public/PublicMdxLayout'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...PublicMdxComponents(), ...components }
}
