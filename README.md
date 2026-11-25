# UNDEFINED ARCH

Магазин-витрина (PWA) на React 19 + TypeScript + Vite 8. Без бэкенда: каталог лежит в JSON,
заказы отправляются в Telegram, админка работает поверх localStorage.

## Стек

- React 19 + react-router-dom 7 (HashRouter, поэтому работает на GitHub Pages без настройки rewrite)
- TypeScript 5.9, Vite 8 (`base: './'`)
- PWA: `public/manifest.json` + `public/sw.js` (service worker регистрируется только в production-сборке)

## Структура проекта

```
index.html               точка входа Vite
src/                     исходники приложения
  main.tsx               bootstrap, регистрация manifest и service worker
  App.tsx                роутинг и раскладка
  config.ts              CONFIG (бренд, ссылки, ключи localStorage) и ADMIN_HASHES
  components/            карточка товара, карусель, модалка заказа, полноэкранное фото
  context/               AdminContext, CatalogContext
  screens/               Catalog, Detail, Search, Archive, Help, AdminPanel
  lib/                   auth, clipboard, order, products, storage
  data/seed.ts           резервный каталог (если products.json не загрузился)
  styles/brutalist.css   все стили
public/                  копируется в сборку как есть
  data/products.json     КАТАЛОГ (единственный файл, который нужно править для товаров)
  images/site/           фон сайта и верхняя плашка
  images/products/       сюда кладутся фото товаров
  manifest.json          PWA manifest
  sw.js                  service worker
  icons/                 иконки PWA
scripts/                 вспомогательные скрипты (в сборку не попадают)
.github/workflows/       GitHub Actions: сборка и публикация на GitHub Pages
```

## Локальный запуск

```
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # локальный просмотр собранной версии http://localhost:4173
npm run typecheck  # только проверка типов
```

Нужен Node.js >= 22.12 (требование Vite 8).

## Каталог

Правится только `public/data/products.json` — массив объектов:

```json
{
  "id": "ua-001",
  "name": "LEATHER BIKER JACKET",
  "price": "€ 24 000",
  "images": ["./images/products/jacket-1.png", "./images/products/jacket-2.jpg"],
  "cover": "./images/products/jacket-1.png",
  "description": "Heavy black leather biker jacket.",
  "soldOut": false,
  "archived": false
}
```

- `images` — массив URL или относительных путей. Фото кладите в `public/images/products/`,
  путь пишите как `./images/products/name.png` (не `/images/...`, иначе на GitHub Pages в подпапке не найдётся).
- `cover` — необязательное главное фото для каталога: PNG без фона. Если поля нет,
  в каталоге показывается `images[0]`. В каталоге подложка прозрачная (PNG «висит» на фоне сайта),
  в карточке товара то же изображение показывается на белой подложке с тонкой рамкой.
  Отдельный файл для карточки не нужен.
- Название в каталоге всегда занимает одну строку; слишком длинное обрезается с `…`,
  полное имя видно во всплывающей подсказке и в карточке товара.
- `soldOut: true` — товар помечается как проданный
- `archived: true` — товар уходит с витрины в раздел ARCHIVE

После правки файла сделайте commit: workflow пересоберёт сайт автоматически.
Если `products.json` не загрузился, приложение показывает резервный каталог из `src/data/seed.ts`.

## Адаптив

- Телефон: 2 колонки, компактная верхняя плашка, фон на весь экран.
- Планшет: 3 колонки, ПК: 4 колонки, широкий ПК: 5 колонок (контейнер до 1500 px).
- Детальная страница на ПК — две колонки: фото слева, информация справа.

Рамка фото в карточке товара настраивается CSS-переменными в `src/styles/brutalist.css`:
`--photo-frame-color`, `--photo-frame-pad`, `--photo-frame-image`.
Когда будет готова декоративная PNG-рамка, достаточно положить её в `public/images/site/`
и задать `--photo-frame-image: url('./images/site/frame.png')` в `:root`.

## Админка

Как войти:

1. Откройте сайт и в течение ~0,9 секунды **трижды тапните по верхней плашке**.
   Откроется экран `ADMIN`.
2. Либо добавьте в адрес `?admin=1`, например: `https://САЙТ/?admin=1#/admin`.
3. Введите логин и пароль, под которые сгенерированы хеши в `src/config.ts`.
   После входа и прокрутки внизу справа появляется кнопка `[ ADMIN ]`.
4. Вход работает только на HTTPS или `localhost` (нужен `crypto.subtle`).

Смена логина/пароля:

```
npm run hash-admin -- <login> <password>
```

Полученный хеш вставьте в `ADMIN_HASHES` в `src/config.ts` и пересоберите сайт.
Плейнтекстовых паролей в репозитории нет.

Публикация изменений:

- Правки админа сохраняются только в браузере (localStorage).
- Чтобы их увидели покупатели: Admin → `EXPORT JSON` → заменить `public/data/products.json` → commit/push.
- Фото товаров сначала положите в `public/images/products/`, затем укажите путь в админке.

## Заказы

Заказ сохраняется на устройстве (My Orders). Отправка открывает чат `t.me/danilkinson` с текстом заказа;
если окно заблокировано, текст копируется в буфер обмена. Внутри Telegram кнопка SEND TO BOT
использует `WebApp.sendData`, когда приложение открыто из кнопки бота.

## Публикация на GitHub Pages

Сборку делает GitHub Actions (`.github/workflows/deploy.yml`), поэтому в репозиторий попадает
только исходный код — `node_modules/` и `dist/` не нужны.

1. Создайте публичный репозиторий на GitHub.
2. Загрузите содержимое этой папки в корень репозитория (не в подпапку), ветка `main`.
   Папки `node_modules/` и `dist/` загружать не нужно — они в `.gitignore` и создаются автоматически.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Дождитесь workflow «Deploy to GitHub Pages» и откройте `https://USER.github.io/REPO/`.

Ссылка на товар: `https://USER.github.io/REPO/#/item/ua-001`.

## Тесты (необязательно)

`scripts/smoke2.mjs` — smoke-прогон в headless Chrome/Edge через `playwright-core`.
Он не входит в зависимости сборки; для запуска:

```
npm run build
npm run preview
npm i -D playwright-core
node scripts/smoke2.mjs
```

## Ограничения

- Бронирование не синхронизируется между устройствами: статус ставит админ.
- Нет сервера: правки в админке приватны, пока не опубликован `public/data/products.json`.
- Персональные Open Graph превью для товаров требуют SSR и здесь недоступны.
- Имя кэша service worker — `ua-pwa-v1`; поднимите версию в `public/sw.js` после изменений логики кэша.
