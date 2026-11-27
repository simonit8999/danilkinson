import adminHashes from '../shared/admin-hashes.json';

/** Адрес API. Пусто = тот же origin (сервер отдаёт и сайт, и API). */
const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/**
 * Адрес API для сборки, открытой НЕ с сервера: GitHub Pages, установленное PWA.
 *
 * Pages — статика, своего /api/* там нет. Без этого адреса посетители читают
 * только public/data/products.json и не видят правки админки, хотя сервер
 * жив и в админке горит ONLINE. Поэтому сборка по умолчанию ходит на
 * постоянный домен туннеля. Если домен сменится — задайте VITE_PUBLIC_API_URL
 * (переменная репозитория или .env) либо поправьте значение ниже.
 */
const DEFAULT_PUBLIC_API = 'https://cricket-palpable-chatter.ngrok-free.dev';
const publicApiBase = (import.meta.env.VITE_PUBLIC_API_URL || DEFAULT_PUBLIC_API)
  .replace(/\/+$/, '');

export const CONFIG = {
  brand: 'UNDEFINED ARCH',
  telegramUsername: 'danilkinson',
  channel: 'UndefinedArch',
  reviews: 'UndefinedReview',
  apiBase,
  publicApiBase,
  dataUrl: `${import.meta.env.BASE_URL}data/products.json`,
  storage: {
    catalog: 'ua_products_v1',
    // Последний удачный каталог с сервера — для офлайна и мгновенного старта.
    catalogCache: 'ua_catalog_cache_v1',
    adminEntry: 'ua_admin_entry_v1',
    adminSession: 'ua_admin_session_v1',
    serverToken: 'ua_server_token_v1',
    apiBase: 'ua_api_base_v1',
  },
  adminSessionTtlMs: 12 * 60 * 60 * 1000,
} as const;

/**
 * Админы = SHA-256 хеши от строки "login:password" (login в lower case).
 * Список лежит в shared/admin-hashes.json: его читает и сайт, и сервер.
 *
 * Сгенерировать новый хеш и добавить в список:
 *   npm run hash-admin -- <login> <password> --add
 */
export const ADMIN_HASHES: readonly string[] = adminHashes;

