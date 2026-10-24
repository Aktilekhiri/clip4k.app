# clip4k.app

Сайт для подготовки видео 1080p/2K/4K 60 fps к TikTok и публикации через Zernio. Сервера нет, всё работает в браузере.

## Где что лежит

| Путь | Что это |
|---|---|
| `public/` | Сам сайт. Только эта папка попадает на Cloudflare |
| `public/index.html` | Разметка и стили |
| `public/app.js` | Логика: обработка видео, публикация через Zernio, языки |
| `public/tail.js` | Добавление «хвоста» в MP4 |
| `public/hero3d.js` | 3D-телефон (собран из `source/hero3d.src.js`) |
| `public/vendor/` | Видеодвижок mediabunny с фиксированной версией |
| `source/hero3d.src.js` | Исходник 3D-сцены |
| `wrangler.jsonc` | Настройки Cloudflare |

## Как публикуется

Cloudflare Worker подключён к этому репозиторию (Workers Builds). Любой коммит в `main` сам публикуется на clip4k.app примерно за минуту.

## Сборка 3D-сцены (только если меняется `source/hero3d.src.js`)

```
npm i three esbuild
npx esbuild source/hero3d.src.js --bundle --minify --format=esm --target=es2020,safari15,chrome90,firefox90,edge90 --outfile=public/hero3d.js
```

## Отладочные параметры адреса

`?debug` (галочка «без хвоста»), `?no3d`, `?scan=0.5`, `?pad=…`, `?layout=chunk`, `?poll=…`
