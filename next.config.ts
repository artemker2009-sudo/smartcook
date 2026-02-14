import withPWAInit from 'next-pwa';

// Настройка PWA
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Выключаем PWA в режиме разработки, чтобы не кэшировалось лишнее
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Мы просим Next.js не останавливать сборку из-за ошибок линтера */
  eslint: {
    ignoreDuringBuilds: true,
  },
  /* Мы просим игнорировать ошибки типов при сборке */
  typescript: {
    ignoreBuildErrors: true,
  },
  // Дополнительная оптимизация для изображений (пригодится)
  images: {
    unoptimized: true, // Иногда нужно для корректной работы иконок в PWA
  }
};

// Оборачиваем конфиг в PWA
export default withPWA(nextConfig);