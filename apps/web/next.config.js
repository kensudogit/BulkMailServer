/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    // Railway 一体型: ブラウザ → /backend/* → 同一コンテナ内 API :8080
    const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8081'
    return [{ source: '/backend/:path*', destination: `${api}/:path*` }]
  },
}
module.exports = nextConfig
