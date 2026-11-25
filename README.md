# UNDEFINED ARCH

Магазин-витрина (PWA) на React 19 + TypeScript + Vite 8. Фронтенд статический:
каталог лежит в JSON, заказы отправляются в Telegram, админка работает поверх localStorage.
Для совместного редактирования каталога есть опциональный локальный сервер
(`server/index.mjs`) + туннель ngrok — см. раздел ниже.

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
  lib/                   auth, api, apiBase, clipboard, order, products, storage
  data/seed.ts           резервный каталог (если products.json не загрузился)
  styles/brutalist.css   все стили
public/                  копируется в сборку как есть
  data/products.json     КАТАЛОГ (единственный файл, который нужно править для товаров)
  images/site/           фон сайта и верхняя плашка
  images/products/       сюда кладутся фото товаров
  manifest.json          PWA manifest
  sw.js                  service worker
  icons/                 иконки PWA/Apple/вкладки (генерируются из аватарки)
scripts/                 вспомогательные скрипты (в сборку не попадают):
                         make-icons.ps1 (иконки), api-check.mjs (проверка сервера)
server/                  локальный сервер каталога (статика dist + API) и publish.mjs
shared/admin-hashes.json хеши админов: читают и сайт, и сервер
.env.example             PORT / HOST / VITE_API_URL
.github/workflows/       GitHub Actions: сборка и публикация на GitHub Pages
```

## Локальный запуск

```
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # локальный просмотр собранной версии http://localhost:4173
npm run typecheck  # только проверка типов
npm run server     # локальный сервер каталога + сайта: http://127.0.0.1:3000
npm run start      # build + server одной командой
npm run check      # проверка API сервера (health, catalog, preflight)
npm run tunnel     # ngrok http 3000 (доступ из интернета)
npm run publish    # server/data/products.json -> public/data/products.json
```

Нужен Node.js >= 22.12 (требование Vite 8).

Если PowerShell блокирует `npm.ps1` («выполнение сценариев отключено»), пишите
`npm.cmd run ...` либо сразу запускайте сервер двойным кликом по `start-server.cmd`.

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

- Телефон: 2 колонки, компактная верхняя плашка на всю ширину, фон на весь экран.
- Планшет: 3 колонки, ПК: 4 колонки, широкий ПК: 5 колонок (контейнер до 1500 px).
- На ПК (от 900 px) верхняя плашка уже и по центру: ширина задаётся переменной
  `--header-max-width` в `:root` (`src/styles/brutalist.css`, по умолчанию 1200 px).
- Детальная страница на ПК — две колонки: фото слева, информация справа.
- На странице товара есть кнопка `← BACK`: возвращает в предыдущее меню (каталог, архив,
  поиск), а если товар открыли по прямой ссылке — ведёт в каталог.

Рамка фото в карточке товара настраивается CSS-переменными в `src/styles/brutalist.css`:
`--photo-frame-color`, `--photo-frame-pad`, `--photo-frame-image`.
Когда будет готова декоративная PNG-рамка, достаточно положить её в `public/images/site/`
и задать `--photo-frame-image: url('./images/site/frame.png')` в `:root`.

## Админка

Как войти (единственный способ):

1. Откройте сайт и **трижды нажмите по верхней плашке** (интервал между нажатиями
   не больше ~0,9 секунды). Откроется экран `ADMIN` со входом.
2. Введите логин и пароль, под которые сгенерированы хеши в `shared/admin-hashes.json`.
3. Никакой плавающей кнопки `[ ADMIN ]` нет: чтобы вернуться в кабинет, снова
   трижды нажмите по верхней плашке. Флаг доступа живёт до закрытия вкладки.
4. Вход работает только на HTTPS или `localhost` (нужен `crypto.subtle`).

Смена логина/пароля:

```
npm run hash-admin -- <login> <password>
```

Полученный хеш вставьте в `shared/admin-hashes.json` (массив строк) и пересоберите сайт.
Этот же файл читает сервер, поэтому доступ появится и в локальной админке.
Плейнтекстовых паролей в репозитории нет.

Публикация изменений:

- Если сайт открыт через локальный сервер (`npm run server` + ngrok), правки админа
  сохраняются в `server/data/products.json` автоматически и сразу видны покупателям.
- Без сервера (например GitHub Pages) правки хранятся в браузере (localStorage):
  Admin → `EXPORT JSON` → заменить `public/data/products.json` → commit/push.
- Фото товаров добавляются ссылкой (поле «URL изображений»); файлы можно положить
  в `public/images/products/` и указать путь `./images/products/name.png`.

## Совместное редактирование каталога (сервер + ngrok)

Сервер `server/index.mjs` отдаёт и собранный сайт (`dist/`), и API каталога,
поэтому клиенту достаточно одной ссылки. Зависимостей нет — только Node.js.

1. Соберите сайт: `npm run build`.
2. Запустите сервер: `npm run server` (порт 3000, слушает только `127.0.0.1`).
3. Поднимите туннель: `npm run tunnel` (нужен установленный и авторизованный ngrok).
   В панели ngrok можно взять бесплатный статический домен, чтобы ссылка не менялась:
   `ngrok http --url=ваш-домен.ngrok-free.dev 127.0.0.1:3000`.
4. Отправьте клиенту ссылку туннеля. Вход в админку — тройной тап по верхней плашке
   (логин/пароль те же, список хешей в `shared/admin-hashes.json`).
5. Любая правка в админке уходит на сервер через `PUT /api/catalog` (автосохранение
   с задержкой ~0,7 с, кнопка `PUBLISH NOW` — сразу). Статус виден в админке:
   `SERVER: ONLINE · SYNC: SAVED`, дата публикации.
6. Если сайт открыт не с сервера (например с GitHub Pages), адрес API задаётся прямо
   в админке: поле **API BASE** → вставьте ссылку туннеля → `SAVE API`. Пересобирать
   сайт не нужно. Адрес запоминается в браузере; `RESET API` возвращает адрес из сборки.
   То же самое можно передать ссылкой: `https://САЙТ/?api=https://ДОМЕН.ngrok-free.dev`.

Добавить отдельный доступ клиенту (и отозвать его удалением строки из JSON):

```
npm run hash-admin -- <login> <password> --add
npm run build
```

Синхронизировать GitHub Pages с серверным каталогом:

```
npm run publish     # копирует server/data/products.json в public/data/products.json
```

Затем закоммитьте `public/data/products.json` — Actions пересоберёт сайт.

Особенности:

- ПК с сервером должен быть включён, сон/гибернация выключены.
- Бесплатный ngrok при первом заходе в браузере показывает промежуточную страницу
  «You are about to visit…» — её нужно один раз подтвердить. API-запросы её обходят.
- Бэкапы каждой записи: `server/data/backups/` (хранятся последние 30).
- Если сервер недоступен, админка продолжает работать локально (localStorage),
  а в статусе будет `SERVER: OFFLINE · SYNC: LOCAL ONLY`.

### Если в админке `SERVER: OFFLINE`

Плашка показывает `ONLINE` только когда клиент успешно получил `/api/catalog`.
Проверяйте по порядку:

1. Запущен ли сервер: `npm.cmd run server` или `start-server.cmd`. Окно с
   `[server] catalog + site: http://127.0.0.1:3000` должно быть открыто.
   ngrok без сервера пробрасывает «в пустоту» — сайт откроется, API будет падать.
2. Одна команда для проверки всего API: `npm.cmd run check` (или
   `npm.cmd run check -- https://ВАШ-ДОМЕН.ngrok-free.dev`). Все строки должны быть `OK`:
   `GET /api/health`, `GET /api/catalog`, `GET /api/products`, `OPTIONS preflight`.
3. Посмотрите в плашке строку `API: ...` — это адрес, куда клиент реально шлёт
   `/api/*`. Если там адрес GitHub Pages (`https://USER.github.io`), значит сайт
   открыт не с сервера: API на Pages нет. Решение — поле **API BASE** в админке:
   вставьте ссылку туннеля и нажмите `SAVE API` (пересборка не нужна), либо
   откройте сам сайт по ссылке туннеля.
4. Сервер печатает актуальный адрес туннеля при старте:
   `[server] tunnel url: https://...ngrok-free.dev`. Если ngrok запущен позже сервера,
   адрес там не появится — возьмите его из окна ngrok или из `http://127.0.0.1:4040/api/tunnels`.
5. Бесплатный домен ngrok меняется при каждом перезапуске. Чтобы ссылка не менялась,
   возьмите статический домен в панели ngrok и запускайте
   `ngrok http --url=ВАШ-ДОМЕН.ngrok-free.dev 127.0.0.1:3000`.
6. Порт 3000 занят другим процессом — сервер не стартует, в консоли `EADDRINUSE`:
   `Get-NetTCPConnection -LocalPort 3000 -State Listen`.
7. После запуска сервера страницу перезагружать не обязательно: клиент сам
   опрашивает API каждые 15 секунд и возвращает статус в `ONLINE`.
8. `SYNC: LOCAL ONLY` при живом сервере означает, что нет токена (сервер
   перезапускали) — нажмите `LOGOUT` и войдите заново.

## Иконки приложения

Все иконки (`public/icons/`) генерируются из одной картинки — аватарки:

```
npm.cmd run icons                        # берёт avatar.jpg из корня проекта
npm.cmd run icons -- -Source avatar.jpg  # или явно указать файл
```

Скрипт создаёт:

- `icon-32.png`, `icon-48.png` — иконка вкладки браузера (Chrome, Safari, Edge и др.);
- `icon-192.png`, `icon-512.png` — установка приложения на телефон (Android/Chrome);
- `maskable-512.png` — иконка для Android с безопасными отступами;
- `apple-touch-icon.png` — ярлык на iPhone/iPad.

Картинка вписывается в белый квадрат с отступами (для favicon отступ минимальный).
После замены иконок поднимите версию кэша в `public/sw.js` (`ua-pwa-v5` → `ua-pwa-v6`)
и пересоберите сайт (`npm.cmd run build`), иначе браузер покажет старую иконку из кэша.
Верхняя плашка сайта (`public/images/site/header-banner.png`) при этом не меняется.

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

### Админка на GitHub Pages

На Pages нет `/api/*`. Два способа связать админку с сервером:

1. Быстро, без пересборки: открыть админку (три нажатия по верхней плашке), в поле
   **API BASE** вставить ссылку туннеля и нажать `SAVE API`. Адрес запоминается в
   браузере. Ссылку можно передать сразу в адресе: `https://САЙТ/?api=https://ДОМЕН.ngrok-free.dev`.
2. Через сборку: Settings → Secrets and variables → Actions → **Variables** →
   New repository variable `VITE_API_URL` = `https://ВАШ-ДОМЕН.ngrok-free.dev`
   (без слэша в конце), затем перезапустить workflow. Сборка подставит адрес по умолчанию.
   Домен ngrok при этом не должен меняться — используйте статический:
   `ngrok http --url=ВАШ-ДОМЕН.ngrok-free.dev 127.0.0.1:3000`.

Правки, сделанные в браузере на одном origin, не видны на другом (localStorage
привязан к домену). Переносите их через `EXPORT JSON` → `IMPORT JSON`.

### Если деплой упал

`Error: Creating Pages deployment failed ... status: 500 ... is githubstatus.com
reporting a Pages outage?` — это сбой на стороне GitHub, код тут не виноват.
Откройте Actions → последний запуск «Deploy to GitHub Pages» → **Re-run failed jobs**
(или Actions → Deploy to GitHub Pages → Run workflow). Проверить состояние:
`https://www.githubstatus.com`.


## Тесты (необязательно)

`scripts/api-check.mjs` — проверка сервера без браузера: `npm.cmd run check`.

`scripts/tap-check.mjs` — проверка входа без зависимостей (headless Chrome/Edge + CDP):
`npm.cmd run tap-check`. Убеждается, что кнопки `[ ADMIN ]` нет в DOM, одно нажатие
по верхней плашке кабинет не открывает, а три открывают экран входа.

`scripts/smoke2.mjs` — smoke-прогон в headless Chrome/Edge через `playwright-core`.
Он не входит в зависимости сборки; для запуска:

```
npm run build
npm run preview
npm i -D playwright-core
node scripts/smoke2.mjs
```

Сценарии админки используют тройное нажатие по верхней плашке; для проверки входа
нужен пароль в переменной `ADMIN1_PASS`.

## Ограничения

- Бронирование не синхронизируется между устройствами: статус ставит админ.
- Без запущенного сервера правки в админке приватны (localStorage на устройстве);
  с сервером они сразу видны всем, кто открыл ссылку туннеля.
- Персональные Open Graph превью для товаров требуют SSR и здесь недоступны.
- Имя кэша service worker — `ua-pwa-v5`; поднимите версию в `public/sw.js` после изменений логики кэша.
