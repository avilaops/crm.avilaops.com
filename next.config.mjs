import createMDX from '@next/mdx'

const withMDX = createMDX({})

export default withMDX({
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  trailingSlash: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_SUPORTE_WHATSAPP: process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP ?? process.env.VITE_SUPORTE_WHATSAPP ?? '',
    NEXT_PUBLIC_SUPORTE_EMAIL: process.env.NEXT_PUBLIC_SUPORTE_EMAIL ?? process.env.VITE_SUPORTE_EMAIL ?? '',
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return []
    const api = process.env.CRM_API_ORIGIN ?? 'http://127.0.0.1:3001'
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }, { source: '/mcp', destination: `${api}/mcp` }]
  },
})
