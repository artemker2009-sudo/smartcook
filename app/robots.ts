import { MetadataRoute } from 'next'

const AI_CRAWLER_USER_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'CCBot',
  'anthropic-ai',
  'ClaudeBot',
  'Claude-Web',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'PerplexityBot',
  'Diffbot',
  'cohere-ai',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin'],
      },
      // ИИ-краулеры, собирающие контент для обучения моделей или для
      // ответов ассистентов — запрещаем полностью. Несанкционированное
      // автоматическое сканирование безопасности/пентест без письменного
      // разрешения владельца тоже запрещены, см. /.well-known/security.txt
      ...AI_CRAWLER_USER_AGENTS.map((userAgent) => ({ userAgent, disallow: '/' })),
    ],
    sitemap: 'https://smart-cook.pro/sitemap.xml',
  }
}
