/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
    outputFileTracingIncludes: {
      '/api/cv-extract': ['./node_modules/pdfjs-dist/**/*'],
    },
  },
}

module.exports = nextConfig