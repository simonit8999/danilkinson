export const CONFIG = {
  brand: 'UNDEFINED ARCH',
  telegramUsername: 'danilkinson',
  channel: 'UndefinedArch',
  reviews: 'UndefinedReview',
  dataUrl: `${import.meta.env.BASE_URL}data/products.json`,
  storage: {
    catalog: 'ua_products_v1',
    adminEntry: 'ua_admin_entry_v1',
    adminSession: 'ua_admin_session_v1',
  },
  adminSessionTtlMs: 12 * 60 * 60 * 1000,
} as const;

/**
 * Два админа = два SHA-256 хеша от строки "login:password" (login в lower case).
 * Плейнтекстовые логины и пароли в репозиторий не попадают.
 *
 * Сгенерировать новый хеш:
 *   node scripts/hash-admin.mjs <login> <password>
 */
export const ADMIN_HASHES: readonly string[] = [
  '152ce097e64400ffce38132dd2bab783dc3ed3373d67a1a3609aa1647074ca9d',
  '6ee5e93de573b482ed8db2abd6d55fad15241b09caa49ed8fd86d29032a882ee',
];
