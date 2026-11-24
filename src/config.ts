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
  'd2cd7aeea3b7dd9188614b9577dedeef78ffe544b20575923ba135faebe750d4',
  '4e008cfa8f8161f2c1ba396f96dc7437171bb09a442982377e5ac647fba9b233',
];
