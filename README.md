# clip4k.app

Сайт для подготовки видео 1080p/2K/4K 60 fps к TikTok и публикации через Zernio. Сервера нет, всё работает в браузере.

## Где что лежит

| Путь | Что это |
|---|---|
| `public/` | Сам сайт. Только эта папка попадает на Cloudflare |
| `public/index.html` | Разметка и стили |
| `public/app.js` | Логика: обработка видео, публикация через Zernio, языки |
| `public/tail.js` | Подготовка MP4 в браузере и сборка файла по ответу сервера |
| `src/worker.js` | Сервер: пробные видео, ключи, чеки, Telegram-бот (`/api/*`) |
| `src/tail.js` | Добавление хвоста (на сервере, по «оглавлению» файла) |
| `migrations/0001_init.sql` | Таблицы базы D1 `clip4k-db` |
| `public/media/` | Фоновое видео «до/после» на главном экране (1080p и 720p) и картинка-заставка |
| `public/vendor/` | Видеодвижок mediabunny с фиксированной версией |
| `source/hero_video.py` | Скрипт, который рисует фоновое видео (Python + ffmpeg) |
| `wrangler.jsonc` | Настройки Cloudflare |

## Как публикуется

Cloudflare Worker подключён к этому репозиторию (Workers Builds). Любой коммит в `main` сам публикуется на clip4k.app примерно за минуту.

## Отладочные параметры адреса

`?debug` (галочка «без хвоста»), `?pad=…`, `?layout=chunk` / `?layout=shared`, `?poll=…`

## Оплата и ключи

- 3 бесплатных видео на устройство (и не больше 6 с одного IP за 30 дней), дальше подписка 200 сом на 30 дней, ключ на 3 устройства.
- Оплата автоматическая через Finik (QR любого банка КР): сайт создаёт платёж (`/api/pay`), Finik присылает подписанный вебхук (`/api/finik/webhook`), ключ выдаётся или продлевается сам (дни прибавляются). Автосписания нет: продлевает сам человек, сайт предлагает это за 7 дней до конца.
- Звёзды Telegram в боте @clip4k_pay_bot: `/buy` — 120 ⭐ за 30 дней, `/renew КЛЮЧ` — продление.
- Старые ключи «навсегда» продолжают работать (в базе `expires = NULL`).
- Команды бота (только для админа): `/newkey [дни] заметка` (без дней — навсегда), `/stats`, `/revoke КЛЮЧ`.
- Новые столбцы базы (`licenses.expires`, `orders.amount/method/fee/...`, таблица `payments`) создаются сами при первом запросе.

Finik: секреты `FINIK_API_KEY`, `FINIK_PRIVATE_KEY`, `FINIK_PUBLIC_KEY`, `FINIK_ACCOUNT_ID` — те же, что у diamond.kg.

Секреты в Cloudflare (Worker → Settings → Variables and Secrets, тип Secret): `TG_BOT_TOKEN`, `TG_ADMIN_CHAT`, `TG_SECRET`.
После их добавления один раз открыть `https://clip4k.app/api/setup?s=ЗНАЧЕНИЕ_TG_SECRET`.

Локальная проверка: `npx wrangler d1 execute clip4k-db --local --file migrations/0001_init.sql` и `npx wrangler dev`
(секреты для теста — в файле `.dev.vars`, он не попадает в репозиторий).
