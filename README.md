# clip4k.app

Сайт для подготовки видео 1080p/2K/4K 60 fps к TikTok и публикации через Zernio. Сервера нет, всё работает в браузере.

## Где что лежит

| Путь | Что это |
|---|---|
| `public/` | Сам сайт. Только эта папка попадает на Cloudflare |
| `public/index.html` | Разметка и стили |
| `public/app.js` | Логика: обработка видео, публикация через Zernio, языки |
| `public/tail.js` | Добавление «хвоста» в MP4 |
| `public/vendor/` | Видеодвижок mediabunny с фиксированной версией |
| `wrangler.jsonc` | Настройки Cloudflare |

## Как публикуется

Cloudflare Worker подключён к этому репозиторию (Workers Builds). Любой коммит в `main` сам публикуется на clip4k.app примерно за минуту.

## Отладочные параметры адреса

`?debug` (галочка «без хвоста»), `?pad=…`, `?layout=chunk` / `?layout=shared`, `?poll=…`
