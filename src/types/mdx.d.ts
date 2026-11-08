declare module '*.mdx' {
  import type { ComponentType } from 'react'

  const Component: ComponentType<{
    authUrl?: string | null
    signupUrl?: string | null
    checking?: boolean
  }>
  export default Component
}
