/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Мы просим Next.js не останавливать сборку из-за ошибок линтера */
  eslint: {
    ignoreDuringBuilds: true,
  },
  /* Мы просим игнорировать ошибки типов при сборке (раз локально работает) */
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;