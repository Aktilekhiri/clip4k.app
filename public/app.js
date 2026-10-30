import {inspectMp4,retimeVideo,ffmpegFtyp,fixAacTiming,splitMp4,assemble,DEFAULT_PAD} from "./tail.js";

const $=i=>document.getElementById(i);
const Q=new URLSearchParams(location.search);
const UA=navigator.userAgent||"";
const isIOS=/iP(hone|ad|od)/.test(UA)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const isAndroid=/Android/i.test(UA);
const inApp=(isIOS&&!/Safari\//.test(UA))||/; wv\)/.test(UA)||/FBAN|FBAV|Instagram|Telegram|TikTok/i.test(UA);
const sget=(s,k)=>{try{return s.getItem(k)}catch(e){return null}};
const sset=(s,k,v)=>{try{s.setItem(k,v)}catch(e){}};
const sdel=(s,k)=>{try{s.removeItem(k)}catch(e){}};
let zkey="",zacc=[],zsel="",zinfo=null,lastPost="",pbusy=false;

// ================= Тексты =================
const T={ru:{h1:"TikTok 4K загрузчик видео",sub:"Подготовьте ролик в 1080p, 2K или 4K с частотой 60 или 120 кадров для TikTok. Обработка идёт в вашем браузере. Видео уходит с устройства только если вы сами опубликуете его в TikTok.",cta:"Выбрать видео",ctasub:"3 видео бесплатно, дальше 500 сом навсегда. Лучше всего работает в Chrome и Safari.",hb:"Обычная загрузка",accleft:"Бесплатных видео осталось:",accok:"Доступ навсегда активен ✓",accbuy:"Купить навсегда за 500 сом",buyh:"Доступ навсегда за 500 сом",buysub:"3 видео бесплатно. Дальше одна оплата 500 сом открывает Clip4K навсегда, на 3 устройствах.",licokt:"Доступ навсегда активен на этом устройстве. Ваш ключ:",licsave:"Сохраните ключ: с ним можно включить доступ на другом телефоне или компьютере.",b1:"Оплатите 500 сом",b1s:"Отсканируйте QR в MBank или O!Bank.",b2:"Отправьте чек",b2s:"Скриншот или фото чека и контакт для связи.",rcl:"Чек об оплате",rcpick:"Выбрать файл",rconl:"Telegram или WhatsApp",rsendt:"Отправить чек",b3:"Получите ключ",b3s:"Мы проверим оплату, и ключ появится здесь сам. Обычно это занимает до часа, страницу можно закрыть.",havek:"У меня уже есть ключ",kgot:"Активировать",ppabroad:"Из другой страны? Оплатите $6 через PayPal и отправьте чек так же.",needpay:"Бесплатные видео закончились. Купите доступ навсегда за 500 сом, это ниже.",srvnet:"Нет связи с сервером Clip4K. Проверьте интернет и попробуйте ещё раз.",srverr:"Сервер Clip4K не ответил. Попробуйте ещё раз через минуту.",keybad:"Ключ не найден или отключён. Проверьте, что ввели его без ошибок.",keydev:"Этот ключ уже используется на 3 устройствах. Напишите нам, если сменили телефон.",keyok:"Ключ активирован. Доступ навсегда включён.",ordwait:"Чек получен. Ждём подтверждения оплаты, ключ появится здесь сам.",ordok:"Оплата подтверждена, доступ навсегда включён.",ordno:"Оплата не подтверждена. Если это ошибка, напишите нам в Telegram @AktilekKaziev.",rneed:"Выберите файл с чеком.",cneed:"Укажите Telegram или номер WhatsApp, чтобы мы могли связаться.",rsending:"Отправляем чек...",roften:"Слишком много попыток. Подождите час и отправьте снова.",rbig:"Файл чека больше 8 МБ. Отправьте скриншот поменьше.",rtype:"Нужна картинка (JPG, PNG) или PDF.",rnotready:"Приём оплаты ещё настраивается. Напишите нам в Telegram @AktilekKaziev.",rfail:"Не удалось отправить чек. Попробуйте ещё раз.",q8:"Что я получаю за 500 сом?",a8:"Доступ к Clip4K навсегда, на 3 устройствах. Это одна оплата, без подписки. Clip4K использует обходной приём: если TikTok изменит обработку и приём перестанет работать, мы будем искать новый способ, но гарантировать его не можем.",sp1:"до 2160p в TikTok",sp2:"кадров в секунду",sp3:"Мбит/с в наших тестах",chipb:"Обычная загрузка",chipa:"120 fps, чётко",
s1:"Видео",s2:"Обработка",s3:"Скачать",drop:"Выберите видео",dropsub:"Перетащите сюда или нажмите. Любой формат, до 350 МБ.",ql:"Разрешение",fl:"Частота кадров",ll:"Формат",f0:"Как есть",l0:"Как есть",l1:"9:16 размытие",l2:"9:16 чёрный",
n120:"120 fps из ролика 30 или 60 fps дублирует кадры. Через Zernio TikTok официально принимает до 60 fps, поэтому 120 fps может зависнуть на проверке.",tl:"Оставить оригинал: без пересжатия, качество 1:1. Для готового MP4 из CapCut, Alight Motion и похожих приложений",adv:"Дополнительно",go:"Подготовить видео",dl:"Скачать MP4",
note:"Экспериментальный обходной приём для пересжатия в TikTok. Он меняет структуру MP4-файла. Нет гарантии, что TikTok сохранит качество, и TikTok может изменить это в любой момент.",
pt:"Опубликовать в TikTok",zbadge:"Подключено",psub:"Чтобы не терять качество, выкладывайте видео с помощью Zernio: файл уходит в TikTok напрямую, без пересжатия в приложении. Подключите свой аккаунт Zernio — ключ остаётся в этом браузере и отправляется только на zernio.com, на сервер Clip4K он не попадает.",zkl:"Ключ API Zernio",zrem:"Запомнить ключ на этом устройстве",zcon:"Подключить",zget:"Получить ключ в Zernio",zout:"Отключить",zadd:"Подключить аккаунт TikTok",zref:"Обновить",accl:"Аккаунт TikTok",phint:"Сначала подготовьте видео в блоке выше, потом вернитесь сюда.",capl:"Подпись",privl:"Кто может смотреть видео",pac:"Разрешить комментарии",pad:"Разрешить дуэты",pas:"Разрешить Stitch",cons:"Я посмотрел видео и проверил подпись. Я согласен опубликовать его в TikTok и принимаю",consl:"Music Usage Confirmation",pubgo:"Опубликовать в TikTok",plink:"Смотреть в TikTok",pprof:"Открыть профиль TikTok",pchk:"Проверить ещё раз",
fq:"Вопросы",q1:"Почему TikTok размывает моё видео?",a1:"TikTok пересжимает каждую загрузку и обычно оставляет качество ниже, чем у вашего файла. Файл H.264 с высоким битрейтом переживает этот шаг с меньшими артефактами.",q4:"Что Clip4K делает с моим файлом?",a4:"По умолчанию ролик перекодируется в браузере (H.264, высокий битрейт), а если выбрать «Дополнительно → Оставить оригинал», картинка и звук остаются как есть. Затем Clip4K добавляет в файл копию звуковой дорожки с крошечными пустыми семплами в конце. В наших тестах TikTok после этого показывал ролик в исходном качестве и битрейте. TikTok не объясняет, почему так, поэтому считайте это обходным приёмом.",q5:"Качество гарантировано?",a5:"Нет. Всё зависит от TikTok, способа публикации и вашего устройства. Из-за лишних данных некоторые плееры и редакторы могут плохо открывать файл. Тогда используйте обычный экспорт.",q6:"120 fps делает видео плавнее?",a6:"Только если исходник тоже 120 fps. Для роликов 30 или 60 fps кадры дублируются: файл помечен как 120 fps, но движение плавнее не становится.",q7:"Что за ключ Zernio и безопасно ли его вставлять?",a7:"Zernio это отдельный сервис, который публикует в TikTok за вас. Ключ вы создаёте в своём аккаунте Zernio и вставляете сюда. Он используется в этом браузере для запросов к zernio.com, на сервер Clip4K он не попадает. Без «Запомнить» ключ забывается, когда вы закрываете вкладку. Удалить ключ можно в Zernio в любой момент. Пользуйтесь доверенным компьютером или телефоном.",q2:"Видео куда-то загружается?",a2:"Нет. Картинка и звук обрабатываются в вашем браузере. Для оптимизации на сервер Clip4K отправляется только служебная часть файла (таблицы, без картинки и звука). Само видео уходит с устройства, только если вы сами публикуете его в TikTok через свой аккаунт Zernio.",q3:"Почему 4K может быть долго на телефоне?",a3:"Видео обрабатывает ваше устройство. Для длинных 4K роликов используйте компьютер или выберите 1080p.",
sup:"Поддержите автора",supsub:"Сервис бесплатный. Если он помог вашим видео, поддержите автора любой суммой через MBank, O!Bank или PayPal.",pp:"Поддержать через PayPal",gaset:"Настройки аналитики",gatext:"Clip4K может считать посещения через Google Analytics. Ваши видео и ключи туда не попадают.",gano:"Нет, спасибо",gayes:"Разрешить",
pchoose:"— выберите —",pv_PUBLIC_TO_EVERYONE:"Все",pv_MUTUAL_FOLLOW_FRIENDS:"Друзья (взаимные подписки)",pv_FOLLOWER_OF_CREATOR:"Мои подписчики",pv_SELF_ONLY:"Только я",
znet:"Не удалось связаться с Zernio. Проверьте интернет. Если ошибка повторяется, браузер мог заблокировать запрос к zernio.com.",ze401:"Ключ не подошёл. Проверьте его в Zernio.",ze403:"Zernio отказал: аккаунт отключён, публикация не разрешена или превышен лимит тарифа.",ze409:"Такая публикация уже была недавно. Измените подпись и попробуйте снова.",ze429:"Слишком много публикаций за короткое время. Подождите и повторите.",zeother:"Ошибка Zernio.",zbad:"Вставьте ключ целиком. Он начинается с sk_.",zchk:"Проверяем...",zbye:"Ключ удалён из этого браузера.",zno:"Аккаунтов TikTok пока нет. Нажмите «Подключить аккаунт TikTok».",zrecon:"нужно переподключить",zleave:"Вы уйдёте с этой страницы, и подготовленное видео пропадёт. Продолжить? Лучше сначала подключить аккаунт, а потом готовить видео.",znoprof:"В Zernio не найден профиль.",zconn:"TikTok подключён.",zfail:"Не удалось подключить TikTok.",zoff:"Выключено в настройках TikTok-аккаунта",
pnomore:"TikTok сообщает, что этот аккаунт сейчас не может публиковать.",plong:"Видео длиннее, чем разрешено для этого аккаунта",pup:"Загружаем видео",ppub:"Публикуем...",pproc:"TikTok обрабатывает видео. Это может занять несколько минут.",ppubd:"Опубликовано.",ppubw:"Опубликовано. Ищем прямую ссылку на ролик, профиль уже можно открыть.",pproc2:"TikTok всё ещё обрабатывает видео. Нажмите «Проверить ещё раз» через минуту.",ppubd2:"Опубликовано. Прямой ссылки пока нет, откройте профиль или нажмите «Проверить ещё раз».",pfail:"Публикация не удалась.",pretry:"Связь с Zernio пропала, пробуем ещё раз...",zput:"Не удалось загрузить видео в хранилище Zernio",zputnet:"Не удалось загрузить видео в хранилище Zernio. Проверьте интернет.",
big:"Файл больше 350 МБ. Выберите другой.",load:"Запускаем обработку...",work:"Обработка: ",tailwork:"Читаем файл...",tailst:"Оптимизируем для TikTok...",done:"Готово. Нажмите «Скачать MP4».",err:"Не получилось обработать видео. Откройте сайт в Chrome или Safari, выберите 1080p или другой файл.",nosup:"Этот браузер не умеет кодировать H.264. Откройте сайт в Chrome, Edge или Safari, либо включите «Дополнительно → Оставить оригинал» для файла H.264 MP4.",nodec:"Браузер не может прочитать кодек этого видео (часто это HEVC с iPhone). Откройте сайт в Safari или Chrome либо экспортируйте ролик в H.264.",retry:"Устройство не тянет такое разрешение, делаем в 1080p...",retry60:"Устройство не тянет 120 fps, делаем 60 fps...",fmt:"Не удалось прочитать результат. Попробуйте другой файл или выберите 1080p.",tailbad:"Для этого режима нужен обычный MP4 (H.264 или HEVC) без фрагментов. Снимите галочку «Оставить оригинал».",
inapp:"Вы открыли сайт внутри приложения (Telegram, Instagram и т.п.). Видео здесь не сохранится. Откройте сайт в Safari: нажмите ⋯ или значок компаса и выберите «Открыть в Safari».",inappA:"Вы открыли сайт внутри приложения (Telegram, Instagram и т.п.). Видео здесь может не сохраниться. Нажмите ⋮ и выберите «Открыть в браузере» или «Открыть в Chrome».",iosnote:"В меню выберите «Сохранить видео»."}};
const EN={"hb": "Typical upload", "h1": "TikTok 4K video uploader", "sub": "Prepare your clip in 1080p, 2K or 4K at 60 or 120 fps for TikTok. Processing runs in your browser. Your video leaves your device only if you choose to publish it to TikTok.", "cta": "Choose a video", "ctasub": "3 videos free, then 500 som forever. Works best in Chrome or Safari.", "sp1": "up to 2160p on TikTok", "sp2": "frames per second", "sp3": "Mbps in our tests", "accbuy": "Get lifetime access for 500 som", "s1": "Video", "s2": "Prepare", "s3": "Download", "drop": "Choose a video", "dropsub": "Drag it here or tap to browse. Any video format, up to 350 MB.", "rect": "Recommended for this video", "ql": "Resolution", "fl": "Frame rate", "n120": "120 fps from a 30 or 60 fps clip repeats frames. Through Zernio, TikTok officially accepts up to 60 fps, so 120 fps can get stuck in review.", "adv": "More options", "ll": "Format", "l0": "As is", "l1": "9:16 blur", "l2": "9:16 black", "tl": "Keep the original: no re-encoding, 1:1 quality. For a finished MP4 from CapCut, Alight Motion and similar apps", "go": "Prepare video", "dl": "Download MP4", "note": "Experimental workaround for TikTok recompression. It changes how the MP4 file is structured. There is no guarantee that TikTok keeps the quality, and TikTok can change this at any time.", "pt": "Publish to TikTok", "zbadge": "Connected", "psub": "To keep the quality, publish with Zernio: the file goes straight to TikTok, without being recompressed by the app. Connect your own Zernio account — the key stays in this browser and is sent only to zernio.com, never to the Clip4K server.", "zkl": "Zernio API key", "zrem": "Remember the key on this device", "zcon": "Connect", "zget": "Get a key from Zernio", "accl": "TikTok account", "zadd": "Connect a TikTok account", "zref": "Refresh", "zout": "Disconnect", "phint": "First prepare a video in the block above, then come back here.", "capl": "Caption", "privl": "Who can watch this video", "pac": "Allow comments", "pad": "Allow Duet", "pas": "Allow Stitch", "cons": "I watched the video and checked the caption. I agree to post it to TikTok and accept TikTok's", "consl": "Music Usage Confirmation", "pubgo": "Publish to TikTok", "plink": "Watch on TikTok", "pchk": "Check again", "fq": "Questions", "q1": "Why does TikTok make my video blurry?", "a1": "TikTok recompresses every upload and usually keeps a lower quality than the file you sent. A high-bitrate H.264 file survives that step with fewer artifacts.", "q4": "What does Clip4K do to my file?", "a4": "By default the clip is re-encoded in your browser (H.264, high bitrate); with \"Keep the original\" (More options) the picture and sound stay as they are. Clip4K then adds a copy of the audio track with tiny empty samples at the end. In our tests TikTok then showed the clip at its original quality and bitrate. TikTok does not document why, so treat it as a workaround.", "q8": "What do I get for 500 som?", "a8": "Lifetime access to Clip4K on 3 devices. It is a single payment, not a subscription. Clip4K uses a workaround: if TikTok changes its processing and it stops working, we will look for a new way, but we cannot guarantee one.", "q5": "Is the quality guaranteed?", "a5": "No. It depends on TikTok, on how you publish and on your device. The extra data can make some players or editors open the file badly. If that happens, use a normal export.", "q6": "Does 120 fps make the video smoother?", "a6": "Only if your source is 120 fps. For 30 or 60 fps clips the frames are repeated, so the file is marked 120 fps but motion does not get smoother.", "q7": "What is the Zernio key and is it safe to paste here?", "a7": "Zernio is a separate service that posts to TikTok for you. You create the key in your own Zernio account and paste it here. It is used in this browser to call zernio.com and never reaches the Clip4K server. Without \"Remember\" it is forgotten when you close the tab. You can delete the key in Zernio at any time. Use a computer or phone you trust.", "q2": "Is my video uploaded anywhere?", "a2": "No. The picture and sound are processed in your browser. To add the tail, only the technical part of the file (its tables, no picture or sound) is sent to the Clip4K server. The video itself leaves your device only if you publish it to TikTok through your own Zernio account.", "q3": "Why can 4K be slow on my phone?", "a3": "The video is processed by your own device. For long 4K clips use a computer, or pick 1080p.", "buyh": "Lifetime access for 500 som", "buysub": "3 videos are free. After that, a single payment of 500 som unlocks Clip4K forever, on 3 devices.", "licokt": "Lifetime access is active on this device. Your key:", "licsave": "Keep the key: it turns on access on another phone or computer.", "b1": "Pay 500 som", "b1s": "Scan a QR code in MBank or O!Bank.", "ppabroad": "Abroad? Pay $6 via PayPal and send the receipt the same way.", "b2": "Send the receipt", "b2s": "A screenshot or photo of the receipt and a contact.", "rcl": "Payment receipt", "rcpick": "Choose file", "rconl": "Telegram or WhatsApp", "rsendt": "Send receipt", "b3": "Get your key", "b3s": "We check the payment and the key appears here by itself. It usually takes up to an hour, you can close the page.", "havek": "I already have a key", "kgot": "Activate", "gaset": "Analytics settings", "gatext": "Clip4K can use Google Analytics to count visits. Your videos and keys are never sent there.", "gano": "No thanks", "gayes": "Allow"};
T.en={...EN,accbuy:"Get lifetime access for 500 som",zoff:"Off in your TikTok account settings",accleft:"Free videos left:",accok:"Lifetime access is active ✓",needpay:"Your free videos are used up. Get lifetime access for 500 som below.",srvnet:"Could not reach the Clip4K server. Check your internet and try again.",srverr:"The Clip4K server did not respond. Try again in a minute.",keybad:"Key not found or disabled. Check that you typed it correctly.",keydev:"This key is already used on 3 devices. Message us if you changed your phone.",keyok:"Key activated. Lifetime access is on.",ordwait:"Receipt received. Waiting for the payment to be confirmed, your key will appear here.",ordok:"Payment confirmed, lifetime access is on.",ordno:"Payment was not confirmed. If this is a mistake, message us on Telegram @AktilekKaziev.",rneed:"Pick the receipt file.",cneed:"Add your Telegram or WhatsApp number so we can reach you.",rsending:"Sending the receipt...",roften:"Too many attempts. Wait an hour and send it again.",rbig:"The receipt file is over 8 MB. Send a smaller screenshot.",rtype:"Send an image (JPG, PNG) or a PDF.",rnotready:"Payments are still being set up. Message us on Telegram @AktilekKaziev.",rfail:"Could not send the receipt. Try again.",pprof:"Open TikTok profile",
pchoose:"— choose —",pv_PUBLIC_TO_EVERYONE:"Everyone",pv_MUTUAL_FOLLOW_FRIENDS:"Friends (mutual follows)",pv_FOLLOWER_OF_CREATOR:"My followers",pv_SELF_ONLY:"Only me",
znet:"Could not reach Zernio. Check your internet. If this keeps happening, the browser may have blocked the request to zernio.com.",ze401:"The key was not accepted. Check it in Zernio.",ze403:"Zernio refused: the account is disconnected, not allowed to post, or over the plan limit.",ze409:"This post was already published recently. Change the caption and try again.",ze429:"Too many posts in a short time. Wait and try again.",zeother:"Zernio error.",zbad:"Paste the whole key. It starts with sk_.",zchk:"Checking...",zbye:"The key was removed from this browser.",zno:"No TikTok accounts yet. Tap \"Connect a TikTok account\".",zrecon:"needs reconnecting",zleave:"You will leave this page and the prepared video will be lost. Continue? It is better to connect the account first and prepare the video afterwards.",znoprof:"No profile found in Zernio.",zconn:"TikTok connected.",zfail:"Could not connect TikTok.",
pnomore:"TikTok says this account cannot post right now.",plong:"The video is longer than this account allows",pup:"Uploading the video",ppub:"Publishing...",pproc:"TikTok is processing the video. This can take a few minutes.",ppubd:"Published.",ppubw:"Published. Looking for the direct link, the profile is already open to view.",pproc2:"TikTok is still processing the video. Tap \"Check again\" in a minute.",ppubd2:"Published. There is no direct link yet, open the profile or tap \"Check again\".",pfail:"Publishing failed.",pretry:"Lost the connection to Zernio, trying again...",zput:"Could not upload the video to Zernio storage",zputnet:"Could not upload the video to Zernio storage. Check your internet.",
big:"File is over 350 MB. Pick another one.",load:"Starting...",work:"Processing: ",tailwork:"Reading the file...",tailst:"Optimizing for TikTok...",done:"Done. Tap \"Download MP4\".",err:"Could not process this video. Open the site in Chrome or Safari, pick 1080p or another file.",nosup:"This browser cannot encode H.264. Open the site in Chrome, Edge or Safari, or tick \"Keep the original\" (More options) for an H.264 MP4 file.",nodec:"This browser cannot read this video's codec (often HEVC from an iPhone). Open the site in Safari or Chrome, or export the clip as H.264.",retry:"Your device cannot do this resolution, switching to 1080p...",retry60:"Your device cannot do 120 fps, switching to 60 fps...",fmt:"Could not read the result. Try another file or pick 1080p.",tailbad:"This mode needs a regular MP4 (H.264 or HEVC) without fragments. Untick \"Keep the original\".",
inapp:"You opened the site inside an app (Telegram, Instagram, etc.). The video will not save here. Open the site in Safari: tap ⋯ or the compass icon and choose \"Open in Safari\".",inappA:"You opened the site inside an app (Telegram, Instagram, etc.). The video may not save here. Tap ⋮ and choose \"Open in browser\" or \"Open in Chrome\".",iosnote:"Choose \"Save Video\" in the menu."};

Object.assign(T.ru,{rect:"Рекомендация для этого видео",recsrc:"Ваше видео:",recland:"горизонтальное",recvert:"вертикальное",recapply:"Применить",recok:"Применено ✓",
 rkeep:"Оставить оригинал — без пересжатия",r916:"9:16 размытие",
 wland:"Горизонтальное видео TikTok в наших тестах показывает в 576p. В формате 9:16 ролик идёт как вертикальный и сохраняет качество.",
 wkeep:"Файл уже подходит для TikTok: MP4, вертикальный, высокое разрешение и частота кадров. Оставим его 1:1 — быстрее и без потерь.",
 wlow:"Видео снято в {f} fps. TikTok покажет 60 fps, плавность останется как в оригинале.",
 wmov:"Это файл MOV (iPhone), его нужно перекодировать в MP4.",
 wsmall:"Разрешение видео небольшое. Выше {q} поднимать нет смысла — деталей не прибавится."});
Object.assign(T.en,{rect:"Recommended for this video",recsrc:"Your video:",recland:"landscape",recvert:"vertical",recapply:"Apply",recok:"Applied ✓",
 rkeep:"Keep the original — no re-encoding",r916:"9:16 blur",
 wland:"In our tests TikTok shows landscape video at 576p. In 9:16 format the clip plays as vertical and keeps its quality.",
 wkeep:"This file already suits TikTok: MP4, vertical, high resolution and frame rate. We keep it 1:1 — faster and lossless.",
 wlow:"The video was shot at {f} fps. TikTok will show 60 fps; motion stays as smooth as the original.",
 wmov:"This is a MOV file (iPhone), so it has to be re-encoded to MP4.",
 wsmall:"The video resolution is small. Going above {q} adds no detail."});
let L="en";
const tr=k=>(T[L]&&T[L][k])??T.en[k]??"";
// Текст, который сам переводится при смене языка: ключ + хвост (числа, ошибки)
function say(el,key,extra=""){el=typeof el==="string"?$(el):el;el.dataset.k=key||"";el.dataset.x=extra;el.textContent=(key?tr(key):"")+extra}
function setL(l){
 L=l;document.documentElement.lang=l;sset(localStorage,"clip4k_lang",l);
 document.querySelectorAll("[data-t]").forEach(e=>e.textContent=tr(e.dataset.t));
 document.querySelectorAll("[data-k]").forEach(e=>{if(e.dataset.k)e.textContent=tr(e.dataset.k)+(e.dataset.x||"")});
 document.querySelectorAll(".lang button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.l==l));
 document.title=l=="ru"?"TikTok 4K загрузчик видео – 4K, 60 и 120 fps для TikTok | Clip4K":"TikTok 4K Video Uploader – Prepare 4K, 60 and 120 fps Video for TikTok | Clip4K";
 if(zacc.length)renderAccLabels();
 if(recData)renderRec();
}
document.querySelectorAll(".lang button").forEach(b=>b.onclick=()=>setL(b.dataset.l));

// ================= Аналитика только с согласия =================
function loadGA(){
 if(window.gtag)return;
 window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};
 gtag("js",new Date());gtag("config","G-VE1DNZ7LMQ",{anonymize_ip:true});
 const s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=G-VE1DNZ7LMQ";document.head.appendChild(s);
}
const ga=sget(localStorage,"clip4k_ga");
if(ga==="1")loadGA();else if(ga!=="0")$("consent").hidden=false;
$("gayes").onclick=()=>{sset(localStorage,"clip4k_ga","1");$("consent").hidden=true;loadGA()};
$("gano").onclick=()=>{sset(localStorage,"clip4k_ga","0");$("consent").hidden=true};
$("gaset").onclick=()=>{$("consent").hidden=false;$("gayes").focus()};

// ================= 3D главный экран =================
(function hero(){
 const stage=$("stage");
 if(!stage)return;   // 3D-телефон убран со страницы
 const rm=matchMedia("(prefers-reduced-motion: reduce)").matches;
 const save=navigator.connection&&navigator.connection.saveData;
 const still=()=>stage.classList.add("static");
 if(rm||save||Q.has("no3d"))return still();
 const go=()=>import("./hero3d.js").then(m=>{if(!m.mountHero(stage))still()}).catch(e=>{console.warn("3D off",e);still()});
 if("requestIdleCallback" in window)requestIdleCallback(go,{timeout:1200});else setTimeout(go,300);
})();

// ================= Подготовка видео =================
const pv=Q.get("pad");
const PAD=pv!==null&&/^\d{1,5}$/.test(pv)?+pv:DEFAULT_PAD;
// Хвост по умолчанию как у RTX Fury: копия звуковой дорожки с пустыми семплами ("audio").
// ?layout=chunk — как Termux-скрипты, ?layout=shared — раскладка v6 (как у Zilem). Без звука — chunk.
const LAYOUT=Q.get("layout")==="chunk"?"chunk":"audio";
if(Q.has("debug"))$("dbg").hidden=false;

let file=null,outBlob=null,outUrl=null,outName="clip4k.mp4",busy=false,MB=null,lastInfo=null;
const hasWC=typeof VideoEncoder!=="undefined"&&typeof VideoDecoder!=="undefined";
let h264=null; // null = ещё не проверили
const h264Check=(async()=>{
 if(!hasWC)return h264=false;
 try{const r=await VideoEncoder.isConfigSupported({codec:"avc1.640028",width:1920,height:1080,bitrate:2e7,framerate:30});return h264=!!r.supported}
 catch(e){return h264=false}
})();
const val=n=>(document.querySelector(`input[name="${n}"]:checked`)||{}).value;
class UserErr extends Error{constructor(key){super(key);this.key=key}}

function stage(n){document.querySelectorAll("#steps li").forEach((li,i)=>{li.classList.toggle("done",i<n-1);li.classList.toggle("on",i==n-1)})}
function idle(){if(busy)return;if(h264===false&&!$("tail").checked){say("st","nosup");$("more").open=true}else if($("st").dataset.k==="nosup")say("st","")}
h264Check.then(idle);

function showWarn(){if(inApp){$("warn").hidden=false;say("warn",isAndroid?"inappA":"inapp")}}
const savedL=sget(localStorage,"clip4k_lang");
const navL=(navigator.languages&&navigator.languages[0])||navigator.language||"";
setL(savedL==="en"?"en":"ru");
showWarn();

$("dl").onclick=async()=>{
 if(!outUrl||!outBlob)return;
 if(isIOS&&navigator.share&&navigator.canShare){
  try{const f=new File([outBlob],outName,{type:"video/mp4"});if(navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}
  catch(e){if(e&&e.name==="AbortError")return;console.warn("share failed",e)}
 }
 const a=document.createElement("a");a.href=outUrl;a.download=outName;document.body.appendChild(a);a.click();a.remove();
};
function pick(x){
 if(!x||busy)return;
 if(x.size>350*1048576){say("st","big");return}
 file=x;$("fn").textContent=x.name+" · "+(x.size/1048576).toFixed(1)+" MB";$("go").disabled=false;$("dl").disabled=true;
 if(outUrl){URL.revokeObjectURL(outUrl);outUrl=null}
 outBlob=null;pubRefresh();
 outName=x.name.replace(/\.[^.]+$/,"")+"_clip4k.mp4";
 stage(2);say("st","");idle();$("bar").style.display="none";
 analyze(x);
}

// ---------- Рекомендация по файлу (только подсказка: обработку видео не меняет) ----------
var recData=null;
const QN={1920:"1080p",2560:"2K",3840:"4K"};
async function analyze(f){
 recData=null;$("rec").hidden=true;
 try{
  const {Input,ALL_FORMATS,BlobSource}=await lib();
  const inp=new Input({source:new BlobSource(f),formats:ALL_FORMATS});
  const v=await inp.getPrimaryVideoTrack();if(!v||file!==f)return;
  let a=null;try{a=await inp.getPrimaryAudioTrack()}catch(e){}
  const w=v.displayWidth||0,h=v.displayHeight||0;if(!w||!h)return;
  let fps=0;try{fps=(await v.computePacketStats(120)).averagePacketRate||0}catch(e){}
  if(file!==f)return;
  const codec=String(v.codec||""),mp4=/\.mp4$/i.test(f.name)||f.type==="video/mp4",mov=/\.mov$/i.test(f.name)||f.type==="video/quicktime";
  const land=w>h*1.05,long=Math.max(w,h);
  const why=[];let r;
  if(!land&&mp4&&(codec==="avc"||codec==="hevc")&&a&&long>=1900&&fps>=47){r={keep:true};why.push(["wkeep"])}
  else{
   const q=land?(long>=3400?3840:2560):(long>=3400?3840:long>=2300?2560:1920);
   const fr=fps>=100?120:60;
   r={keep:false,q,fps:fr,lay:land?"blur":"asis"};
   if(land)why.push(["wland"]);
   if(mov)why.push(["wmov"]);
   if(fps&&fps<47)why.push(["wlow",{f:Math.round(fps)}]);
   if(!land&&long<1900)why.push(["wsmall",{q:"1080p"}]);
  }
  recData={w,h,fps,codec,land,r,why};renderRec();
 }catch(e){console.warn("analyze",e)}
}
function renderRec(){
 const d=recData;if(!d)return;
 const fps=d.fps?(Math.abs(d.fps-Math.round(d.fps))<0.05?Math.round(d.fps):d.fps.toFixed(1))+" fps":"";
 const cod={avc:"H.264",hevc:"HEVC",vp9:"VP9",av1:"AV1"}[d.codec]||d.codec.toUpperCase();
 $("recsrc").textContent=tr("recsrc")+" "+[d.w+"×"+d.h,fps,cod,tr(d.land?"recland":"recvert")].filter(Boolean).join(" · ");
 $("recval").textContent=d.r.keep?tr("rkeep"):[d.r.lay==="blur"?tr("r916"):"",QN[d.r.q],d.r.fps+" fps"].filter(Boolean).join(" · ");
 const ul=$("recwhy");ul.textContent="";
 for(const [k,p] of d.why){const li=document.createElement("li");li.textContent=tr(k).replace(/\{(\w+)\}/g,(_,x)=>p&&p[x]!=null?p[x]:"");ul.appendChild(li)}
 $("recgo").textContent=tr(recApplied()?"recok":"recapply");
 $("rec").hidden=false;
}
function setRadio(n,v){const e=document.querySelector(`input[name="${n}"][value="${v}"]`);if(e&&!e.checked){e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}))}}
function recApplied(){
 const r=recData&&recData.r;if(!r)return false;
 if(r.keep)return $("tail").checked;
 return !$("tail").checked&&val("q")==String(r.q)&&val("fps")==String(r.fps)&&val("lay")===r.lay;
}
function applyRec(){
 const r=recData&&recData.r;if(!r||busy)return;
 if(r.keep){if(!$("tail").checked){$("tail").checked=true;$("tail").dispatchEvent(new Event("change"))}}
 else{
  if($("tail").checked){$("tail").checked=false;$("tail").dispatchEvent(new Event("change"))}
  setRadio("q",r.q);setRadio("fps",r.fps);setRadio("lay",r.lay);
  if(r.lay!=="asis")$("more").open=true;
 }
 renderRec();
}
$("recgo").onclick=applyRec;
document.querySelectorAll('#opts input,#opts2 input,#tail').forEach(e=>e.addEventListener("change",()=>{if(recData)$("recgo").textContent=tr(recApplied()?"recok":"recapply")}));
$("f").onchange=e=>{pick(e.target.files[0]);e.target.value=""};   // сброс: тот же файл можно выбрать снова
$("tail").onchange=()=>{$("opts").disabled=$("opts2").disabled=$("tail").checked;if($("tail").checked)$("more").open=true;idle()};
document.querySelectorAll('input[name="fps"]').forEach(r=>r.addEventListener("change",()=>{$("n120").hidden=val("fps")!=="120"}));
const d=$("drop");
["dragover","dragenter"].forEach(n=>d.addEventListener(n,e=>{e.preventDefault();d.classList.add("on")}));
["dragleave","drop"].forEach(n=>d.addEventListener(n,e=>{e.preventDefault();d.classList.remove("on")}));
d.addEventListener("drop",e=>pick(e.dataTransfer.files[0]));
// Можно бросить файл в любое место страницы
addEventListener("dragover",e=>e.preventDefault());
addEventListener("drop",e=>{if(!d.contains(e.target)){e.preventDefault();if(e.dataTransfer.files[0]){pick(e.dataTransfer.files[0]);$("tool").scrollIntoView({behavior:"smooth"})}}});

// Движок лежит рядом с сайтом с точной версией: не сломается от чужого обновления.
async function lib(){
 if(MB)return MB;
 try{MB=await import("./vendor/mediabunny-1.61.3.min.mjs");return MB}
 catch(e){console.warn(e);throw new Error("Could not load video engine. Check your internet connection.")}
}
function mk(w,h){return typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(w,h):Object.assign(document.createElement("canvas"),{width:w,height:h})}

// Кадр 9:16: фон (размытый или чёрный) и по центру исходный кадр целиком.
function makeLayout(W,H,mode){
 const cv=mk(W,H),cx=cv.getContext("2d",{alpha:false});
 const bw=Math.max(2,W>>4),bh=Math.max(2,H>>4);
 const sm=mode==="blur"?mk(bw,bh):null,sx=sm&&sm.getContext("2d");
 return s=>{
  const iw=s.displayWidth,ih=s.displayHeight;
  if(mode==="black"){cx.fillStyle="#000";cx.fillRect(0,0,W,H)}
  else{
   const k=Math.max(bw/iw,bh/ih),cw=iw*k,ch=ih*k;
   s.draw(sx,(bw-cw)/2,(bh-ch)/2,cw,ch);
   cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality="high";
   cx.drawImage(sm,0,0,W,H);
  }
  const k2=Math.min(W/iw,H/ih),dw=Math.round(iw*k2),dh=Math.round(ih*k2);
  s.draw(cx,Math.round((W-dw)/2),Math.round((H-dh)/2),dw,dh);
  return cv;
 };
}
function bitrate(eff,fps){const base=eff>=3000?40e6:eff>=2000?30e6:20e6;return fps>=120?base*1.5:base}

async function run(cfg,t0){
 const {Input,Output,Conversion,ALL_FORMATS,BlobSource,Mp4OutputFormat,BufferTarget,Quality}=await lib();
 const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
 // Оглавление (moov) в конце файла, как у ffmpeg в Termux
 const output=new Output({format:new Mp4OutputFormat({fastStart:false}),target:new BufferTarget()});
 let w=0,h=0;
 try{const t=await input.getPrimaryVideoTrack();if(t){w=t.displayWidth||0;h=t.displayHeight||0}}catch(e){console.warn(e)}
 const cap=cfg.cap,long=Math.max(w,h);
 const eff=cfg.layout==="asis"&&long?Math.min(cap,long):cap;
 // Постоянный битрейт, как -b:v/-maxrate в Termux. Если браузер не умеет, encode() повторит с переменным.
 const br=bitrate(eff,cfg.fps);
 const video={codec:"avc",forceTranscode:true,quality:cfg.vbr?br:new Quality({bitrate:br,bitrateMode:"constant"})};
 video.frameRate=cfg.fps||60;   // всегда ровная частота кадров, как fps=60 в ffmpeg
 if(cfg.layout==="asis"){if(long>cap){const v=Math.floor(cap/2)*2;if(h>=w)video.height=v;else video.width=v}}
 else{const H=Math.floor(cap/2)*2,W=Math.floor(cap*9/16/2)*2;video.process=makeLayout(W,H,cfg.layout);video.processedWidth=W;video.processedHeight=H}
 // Звук как в Termux: AAC 48 кГц 192 кбит/с. Если браузер не умеет кодировать AAC, звук копируется как есть.
 const audio=cfg.copyAudio?undefined:{codec:"aac",sampleRate:48000,bitrate:192e3,forceTranscode:true};
 const conv=await Conversion.init({input,output,video,audio});
 const lostAudio=(conv.discardedTracks||[]).find(x=>x.track&&(x.track.type==="audio"||(x.track.isAudioTrack&&x.track.isAudioTrack())));
 if(lostAudio&&!cfg.copyAudio){console.warn("audio transcode unsupported, copying",lostAudio.reason);return run({...cfg,copyAudio:true},t0)}
 const bad=(conv.discardedTracks||[]).find(x=>x.track&&(x.track.type==="video"||(x.track.isVideoTrack&&x.track.isVideoTrack())));
 if(bad&&bad.reason==="undecodable_source_codec")throw new UserErr("nodec");
 if(!conv.isValid||bad)throw new Error("video track unsupported"+(bad?" ("+bad.reason+")":""));
 let last=Date.now(),stallT;
 conv.onProgress=p=>{last=Date.now();const q=Math.max(0,Math.min(1,p));$("pg").style.width=(q*100)+"%";say("st","work",Math.round(q*100)+"% · "+Math.round((Date.now()-t0)/1000)+"s")};
 const stalled=new Promise((_,rej)=>{stallT=setInterval(()=>{if(Date.now()-last>40000){try{conv.cancel&&conv.cancel()}catch(e){}rej(new Error("stalled"))}},3000)});
 try{await Promise.race([conv.execute(),stalled])}finally{clearInterval(stallT)}
 const buf=output.target.buffer;
 if(!buf||!buf.byteLength)throw new Error("empty output");
 // Шаг времени 1/fps → 1/90000, иначе укорачивание последнего кадра в хвосте не работает
 const r=retimeVideo(new Uint8Array(buf));
 console.info("retime",r.from,"→",r.to);
 const fx=fixAacTiming(r.buf);   // Safari иногда пишет звук с одинаковыми метками времени
 if(fx.fixed)console.info("audio timing fixed");
 return ffmpegFtyp(fx.buf);
}
// Если устройство не тянет 120 fps или 4K, отступаем на шаг: сначала fps, потом разрешение.
async function encode(cfg,t0){
 let c={...cfg};
 for(;;){
  try{return await run(c,t0)}
  catch(e){
   if(e instanceof UserErr)throw e;
   console.warn("encode failed",c,e);
   if(!c.vbr){c={...c,vbr:true}}
   else if(c.fps>60){c={...c,fps:60};say("st","retry60")}
   else if(c.cap>1920){c={...c,cap:1920};say("st","retry")}
   else throw e;
   $("pg").style.width="0";
  }
 }
}

$("go").onclick=async()=>{
 if(!file||busy)return;
 const tailOnly=$("tail").checked;
 await h264Check;
 if(!tailOnly&&!h264){say("st","nosup");return}
 if(!$("notail").checked&&ACC.ready&&!ACC.licensed&&ACC.trialsLeft<=0){needPay();return}
 busy=true;$("go").disabled=true;$("bar").style.display="block";$("pg").style.width="0";$("dl").disabled=true;
 if(outUrl){URL.revokeObjectURL(outUrl);outUrl=null}
 outBlob=null;pubRefresh();
 stage(2);say("st",tailOnly?"tailwork":"load");
 const t0=Date.now();
 try{
  let buf,fin;
  if(tailOnly){
   buf=new Uint8Array(await file.arrayBuffer());
   if(LAYOUT!=="audio")buf=retimeVideo(buf).buf;   // способ RTX Fury видео не трогает
   try{fin=inspectMp4(buf,{allowHevc:LAYOUT==="audio"})}catch(e){console.warn(e);fin={ok:false}}
   if(!fin.ok)throw new UserErr("tailbad");
  }else{
   const raw=await encode({cap:+val("q"),fps:+val("fps"),layout:val("lay")},t0);
   buf=raw;
   try{fin=inspectMp4(buf)}catch(e){console.warn(e);fin={ok:false}}
   if(!fin.ok)throw new UserErr("fmt");
  }
  $("pg").style.width="100%";say("st","tailst");
  await new Promise(r=>setTimeout(r,30));
  lastInfo=fin;
  const blob=$("notail").checked?new Blob([buf],{type:"video/mp4"}):await serverTail(buf);
  outBlob=blob;outUrl=URL.createObjectURL(blob);
  $("dl").disabled=false;$("dl").classList.remove("ready");void $("dl").offsetWidth;$("dl").classList.add("ready");
  stage(3);pubRefresh();pwarnUpdate();
  const fps=fin.fps?(Math.abs(fin.fps-Math.round(fin.fps))<0.05?Math.round(fin.fps):fin.fps.toFixed(2)):"?";
  say("st","done"," ("+Math.round(fin.width)+"×"+Math.round(fin.height)+", "+fps+" fps, "+(blob.size/1048576).toFixed(1)+" MB, "+Math.round((Date.now()-t0)/1000)+"s)");
  if(isIOS)$("st").dataset.x+=" "+tr("iosnote"),$("st").textContent+=" "+tr("iosnote");
  $("dl").scrollIntoView({behavior:"smooth",block:"center"});
 }catch(e){
  console.error(e);stage(2);
  if(e instanceof UserErr){say("st",e.key);if(e.key==="needpay")needPay()}
  else say("st","err"," ["+String((e&&e.message)||e).slice(0,90)+"]");
 }
 busy=false;$("go").disabled=false;
};

// ================= Доступ: пробные видео и ключ навсегда =================
// Хвост добавляет сервер: ему уходит только «оглавление» файла (ftyp и moov), не видео.
const DEVK="clip4k_dev",LICK="clip4k_lic",ORDK="clip4k_order";
const DEV=(()=>{let d=sget(localStorage,DEVK);if(!/^[0-9a-f]{32}$/.test(d||"")){const b=new Uint8Array(16);crypto.getRandomValues(b);d=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");sset(localStorage,DEVK,d)}return d})();
const ACC={ready:false,licensed:false,trialsLeft:3,trials:3,key:sget(localStorage,LICK)||""};
function accUi(){
 const bar=$("accbar");bar.textContent="";
 const t=document.createElement("span");bar.appendChild(t);
 if(ACC.licensed){t.textContent=tr("accok");bar.className="accbar ok";$("licok").hidden=false;$("lickey").textContent=ACC.key;$("buyflow").hidden=true}
 else{
  t.textContent=tr("accleft")+" "+ACC.trialsLeft+" / "+ACC.trials;bar.className="accbar"+(ACC.trialsLeft<=0?" none":"");
  const a=document.createElement("a");a.href="#buy";a.textContent=tr("accbuy");bar.appendChild(a);
  $("licok").hidden=true;$("buyflow").hidden=false;
 }
}
document.querySelectorAll(".lang button").forEach(b=>b.addEventListener("click",accUi));
async function accRefresh(){
 try{
  const r=await fetch("/api/status?device="+DEV+(ACC.key?"&key="+encodeURIComponent(ACC.key):""));
  const j=await r.json();if(!r.ok)throw 0;
  ACC.ready=true;ACC.licensed=!!j.licensed;ACC.trialsLeft=j.trialsLeft;ACC.trials=j.trials||3;
  if(ACC.key&&!j.licensed&&j.keyError==="badkey"){sdel(localStorage,LICK);ACC.key=""}
 }catch(e){console.warn("status",e)}
 accUi();
}
function needPay(){say("st","needpay");$("buy").scrollIntoView({behavior:"smooth",block:"start"})}
async function serverTail(buf){
 const p=splitMp4(buf);
 if(!p.ok)throw new UserErr("tailbad");
 const meta={ftypLen:p.ftyp.length,mdatPos:p.mdatPos,mdatSize:p.mdatSize,layout:LAYOUT,pad:PAD};
 let r;
 try{r=await fetch("/api/tail",{method:"POST",headers:{"x-device":DEV,"x-key":ACC.key,"x-meta":JSON.stringify(meta),"content-type":"application/octet-stream"},body:new Blob([p.ftyp,p.moov])})}
 catch(e){throw new UserErr("srvnet")}
 if(r.status===402){ACC.trialsLeft=0;accUi();throw new UserErr("needpay")}
 if(r.status===409)throw new UserErr("keydev");
 if(r.status===403){sdel(localStorage,LICK);ACC.key="";ACC.licensed=false;accRefresh();throw new UserErr("keybad")}
 if(r.status===422)throw new UserErr("tailbad");
 if(!r.ok)throw new UserErr("srverr");
 const head={moov:new Uint8Array(await r.arrayBuffer()),layout:r.headers.get("x-layout"),pad:+r.headers.get("x-pad")};
 const left=r.headers.get("x-trials-left");
 if(left!==null&&left!=="")ACC.trialsLeft=+left;
 if(r.headers.get("x-licensed")==="1")ACC.licensed=true;
 accUi();
 return assemble(p,head);
}
async function activate(key,quiet){
 key=String(key||"").trim().toUpperCase();
 if(!quiet)say("kst","zchk");
 try{
  const r=await fetch("/api/activate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({key,device:DEV})});
  const j=await r.json().catch(()=>({}));
  if(r.ok){ACC.key=j.key||key;sset(localStorage,LICK,ACC.key);ACC.licensed=true;accUi();say("kst","keyok");return true}
  say("kst",r.status===409?"keydev":"keybad");
 }catch(e){say("kst","srvnet")}
 return false;
}
$("kgo").onclick=()=>activate($("kin").value);
$("kin").addEventListener("keydown",e=>{if(e.key==="Enter")activate($("kin").value)});
let pollT=0;
async function pollOrder(){
 clearTimeout(pollT);
 let o;try{o=JSON.parse(sget(localStorage,ORDK)||"null")}catch(e){}
 if(!o||!o.id)return;
 try{
  const r=await fetch("/api/order?id="+encodeURIComponent(o.id)+"&token="+encodeURIComponent(o.token));
  const j=await r.json();
  if(r.status===404){sdel(localStorage,ORDK);return}
  if(j.status==="approved"&&j.key){sdel(localStorage,ORDK);$("kin").value=j.key;await activate(j.key,true);say("rst","ordok");return}
  if(j.status==="rejected"){sdel(localStorage,ORDK);say("rst","ordno");return}
  say("rst","ordwait");
 }catch(e){say("rst","ordwait")}
 pollT=setTimeout(pollOrder,15000);
}
$("rsend").onclick=async()=>{
 const f=$("rcpt").files[0],c=$("rcon").value.trim();
 if(!f){say("rst","rneed");return}
 if(c.length<3){say("rst","cneed");$("rcon").focus();return}
 const fd=new FormData();fd.set("receipt",f);fd.set("contact",c);fd.set("device",DEV);
 $("rsend").disabled=true;say("rst","rsending");
 try{
  const r=await fetch("/api/order",{method:"POST",body:fd});
  const j=await r.json().catch(()=>({}));
  if(r.ok){sset(localStorage,ORDK,JSON.stringify({id:j.id,token:j.token}));say("rst","ordwait");pollTimerStart()}
  else say("rst",r.status===429?"roften":r.status===413?"rbig":r.status===415?"rtype":r.status===503?"rnotready":"rfail");
 }catch(e){say("rst","srvnet")}
 $("rsend").disabled=false;
};
function pollTimerStart(){pollT=setTimeout(pollOrder,15000)}
$("rcpt").onchange=()=>{const f=$("rcpt").files[0];$("rfn").textContent=f?f.name:""};
accRefresh();pollOrder();

// ================= Публикация в TikTok через Zernio =================
// У сайта нет сервера: ключ Zernio вводит сам пользователь, браузер ходит на zernio.com напрямую.
const ZAPI="https://zernio.com/api/v1";
const LSK="clip4k_zkey",SSK="clip4k_zkey_tmp";
const pq=Q.get("poll");
const POLL=pq!==null&&/^\d{2,5}$/.test(pq)?+pq:6000;
class ZErr extends Error{constructor(code,key,extra=""){super(key+extra);this.code=code;this.key=key;this.extra=extra}}
const safeUrl=u=>typeof u==="string"&&/^https:\/\//i.test(u)?u:"";
const zsay=(el,e)=>e instanceof ZErr?say(el,e.key,e.extra):say(el,"zeother"," ["+String(e&&e.message||e).slice(0,120)+"]");

async function zf(path,{method="GET",body}={}){
 const h={Authorization:"Bearer "+zkey};
 const init={method,headers:h};
 if(body!==undefined){h["Content-Type"]="application/json";init.body=JSON.stringify(body)}
 let r;
 try{r=await fetch(ZAPI+path,init)}catch(e){throw new ZErr("net","znet")}
 let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok){
  let m=j&&(typeof j.error==="string"?j.error:(j.error&&j.error.message)||j.message)||"";
  m=String(m).slice(0,160);
  throw new ZErr(r.status,T.en["ze"+r.status]?"ze"+r.status:"zeother",m?" ["+m+"]":"");
 }
 return j||{};
}

function zui(){
 const on=!!zkey;
 $("zkin").hidden=on;$("zacc").hidden=!on;$("zform").hidden=!on;$("zbadge").hidden=!on;
}
async function zconnect(){
 const k=($("zk").value||"").trim();
 if(!/^sk_\S{16,}$/.test(k)){say("zst","zbad");return}
 zkey=k;$("zcon").disabled=true;say("zst","zchk");
 try{
  await zloadAccounts();
  if($("zrem").checked)sset(localStorage,LSK,zkey);else sdel(localStorage,LSK);
  $("zk").value="";say("zst","");zui();
 }catch(e){zkey="";zui();zsay("zst",e)}
 $("zcon").disabled=false;
}
$("zcon").onclick=zconnect;
$("zk").addEventListener("keydown",e=>{if(e.key==="Enter")zconnect()});
$("zout").onclick=()=>{
 zkey="";zacc=[];zsel="";zinfo=null;
 sdel(localStorage,LSK);sdel(sessionStorage,SSK);
 $("zk").value="";say("zst","zbye");say("pst","");$("plink").hidden=true;$("pchk").hidden=true;
 zui();pubRefresh();
};

async function zloadAccounts(){
 const j=await zf("/accounts?platform=tiktok");
 zacc=(j.accounts||[]).filter(a=>a&&a.platform==="tiktok"&&a._id);
 renderAcc();
}
function accOk(a){return a.isActive!==false&&a.needsReconnection!==true}
function accName(a){return "@"+String(a.username||a.displayName||a._id).replace(/^@/,"")+(accOk(a)?"":" · "+tr("zrecon"))}
function renderAccLabels(){document.querySelectorAll("#zlist .acc span").forEach((s,i)=>{if(zacc[i])s.textContent=accName(zacc[i])})}
function renderAcc(){
 const box=$("zlist");box.textContent="";
 const act=zacc.filter(accOk);
 if(!zsel||!act.find(a=>a._id===zsel))zsel=act[0]?act[0]._id:"";
 if(!zacc.length){const p=document.createElement("p");p.className="st";say(p,"zno");box.appendChild(p)}
 zacc.forEach(a=>{
  const l=document.createElement("label");l.className="acc";
  const r=document.createElement("input");r.type="radio";r.name="zacc";r.value=a._id;r.checked=a._id===zsel;r.disabled=!accOk(a);
  r.onchange=()=>{zsel=a._id;loadCreator()};
  const s=document.createElement("span");s.textContent=accName(a);
  l.append(r,s);box.appendChild(l);
 });
 loadCreator();
}
$("zref").onclick=async()=>{
 if(!zkey)return;say("zst","zchk");
 try{await zloadAccounts();say("zst","")}catch(e){zsay("zst",e)}
};
$("zadd").onclick=async()=>{
 if(!zkey)return;
 if(outBlob&&!confirm(tr("zleave")))return;
 say("zst","zchk");
 try{
  const pr=await zf("/profiles");
  const list=pr.profiles||[];
  const p=list.find(x=>x.isDefault)||list[0];
  if(!p)throw new ZErr("x","znoprof");
  const ru=location.origin+location.pathname;
  const c=await zf("/connect/tiktok?profileId="+encodeURIComponent(p._id)+"&redirect_url="+encodeURIComponent(ru));
  const u=safeUrl(c.authUrl);
  if(!u)throw new ZErr("x","zeother");
  sset(sessionStorage,SSK,zkey);   // переживает переход на TikTok и возвращение
  location.href=u;
 }catch(e){zsay("zst",e)}
};

// Настройки аккаунта по данным TikTok (creator-info). Галочки по умолчанию выключены, как требует TikTok.
function descr(d){return {on:!d||d.enabled!==false,def:!!(d&&d.default)}}
function setToggle(id,d){
 const x=descr(d),el=$(id),lab=el.closest("label");
 el.disabled=!x.on;el.checked=x.on?x.def:false;
 lab.style.opacity=x.on?"1":".45";
 if(x.on)lab.removeAttribute("title");else lab.title=tr("zoff");
}
async function loadCreator(){
 zinfo=null;
 const sel=$("priv");sel.textContent="";
 const o0=document.createElement("option");o0.value="";o0.dataset.t="pchoose";o0.textContent=tr("pchoose");sel.appendChild(o0);
 $("pwarn").textContent="";
 ["t-com","t-duet","t-stitch"].forEach(i=>{$(i).disabled=true;$(i).checked=false});
 if(!zsel){pubRefresh();return}
 const my=zsel;
 try{
  const j=await zf("/accounts/"+encodeURIComponent(zsel)+"/tiktok/creator-info");
  if(my!==zsel)return;
  zinfo=j;
  (j.privacyLevels||[]).forEach(p=>{
   if(!p||!p.value)return;
   const o=document.createElement("option");o.value=p.value;
   const k="pv_"+p.value;
   if(T.en[k]){o.dataset.t=k;o.textContent=tr(k)}else o.textContent=p.label||p.value;
   sel.appendChild(o);
  });
  const ia=(j.postingLimits&&j.postingLimits.interactionSettings)||{};
  setToggle("t-com",ia.allow_comment);setToggle("t-duet",ia.allow_duet);setToggle("t-stitch",ia.allow_stitch);
  pwarnUpdate();
 }catch(e){if(my===zsel)zsay("pwarn",e)}
 pubRefresh();
}
function pwarnUpdate(){
 if(!zinfo)return;
 const w=[];
 if(zinfo.creator&&zinfo.creator.canPostMore===false)w.push(tr("pnomore"));
 const max=zinfo.postingLimits&&zinfo.postingLimits.maxVideoDurationSec;
 if(max&&lastInfo&&lastInfo.seconds>max)w.push(tr("plong")+" ("+Math.round(lastInfo.seconds)+" > "+max+" s)");
 $("pwarn").textContent=w.join(" ");
}
function pubReady(){
 return !!(outBlob&&zkey&&zsel&&zinfo&&$("priv").value&&$("cons").checked&&$("cap").value.length<=2200&&!pbusy&&!(zinfo.creator&&zinfo.creator.canPostMore===false));
}
function pubRefresh(){
 $("capn").textContent=$("cap").value.length+"/2200";
 $("pubgo").disabled=!pubReady();
 $("phint").hidden=!!outBlob;
}
["cap","priv","cons"].forEach(i=>$(i).addEventListener(i==="cap"?"input":"change",pubRefresh));

function setP(key,f,extra=""){say("pst",key,extra);if(f!==undefined){$("pbar").style.display="block";$("ppg").style.width=(f*100)+"%"}}
function putBlob(url,blob,on){
 return new Promise((res,rej)=>{
  const x=new XMLHttpRequest();
  x.open("PUT",url);x.setRequestHeader("Content-Type","video/mp4");
  x.upload.onprogress=e=>{if(e.lengthComputable)on(e.loaded/e.total)};
  x.onload=()=>x.status>=200&&x.status<300?res():rej(new ZErr("put","zput"," ["+x.status+"]"));
  x.onerror=()=>rej(new ZErr("put","zputnet"));
  x.send(blob);
 });
}

const FINAL={published:1,failed:1,cancelled:1};
function pview(post){
 const pl=(post&&post.platforms&&post.platforms[0])||{};
 return {s:pl.status||(post&&post.status)||"",url:safeUrl(pl.platformPostUrl),err:String(pl.errorMessage||"").slice(0,200)};
}
function profileUrl(){const a=zacc.find(x=>x._id===zsel),u=a&&String(a.username||"").replace(/^@/,"");return u&&/^[\w.]+$/.test(u)?"https://www.tiktok.com/@"+u:""}
function pshow(v,last){
 const lk=$("plink"),ck=$("pchk");
 lk.hidden=true;ck.hidden=true;
 if(v.s==="published"){
  if(v.url){setP("ppubd");lk.href=v.url;say(lk,"plink");lk.hidden=false}
  else{
   // Видео уже в TikTok: профиль показываем сразу, прямую ссылку подставим, когда появится
   const pu=profileUrl();if(pu){lk.href=pu;say(lk,"pprof");lk.hidden=false}
   if(last){setP("ppubd2");ck.hidden=false}else setP("ppubw");
  }
 }else if(v.s==="failed"||v.s==="cancelled"){setP("pfail",undefined,v.err?" ["+v.err+"]":"")}
 else if(last){setP("pproc2");ck.hidden=false}
 else setP("pproc");
}
async function trackPost(post){
 let v=pview(post),urlWait=0,fails=0;
 pshow(v);
 for(let i=0;i<100;i++){
  if(FINAL[v.s]&&(v.s!=="published"||v.url||urlWait>=40))break;
  if(v.s==="published")urlWait++;
  await new Promise(r=>setTimeout(r,v.s==="published"?Math.max(POLL,12000):POLL));
  try{
   const j=await zf("/posts/"+encodeURIComponent(lastPost));
   fails=0;v=pview(j.post);pshow(v);
  }catch(e){
   // Сбой одного запроса не значит, что публикация сорвалась: ждём и пробуем снова
   const temp=e instanceof ZErr&&(e.code==="net"||e.code===429||e.code>=500);
   if(!temp||++fails>5)throw e;
   setP("pretry");
   await new Promise(r=>setTimeout(r,POLL*fails));
  }
 }
 pshow(v,true);
 return v;
}
$("pchk").onclick=async()=>{
 if(!lastPost||!zkey)return;
 $("pchk").disabled=true;
 try{const j=await zf("/posts/"+encodeURIComponent(lastPost));await trackPost(j.post)}
 catch(e){zsay("pst",e)}
 $("pchk").disabled=false;
};
$("pubgo").onclick=async()=>{
 if(!pubReady())return;
 pbusy=true;pubRefresh();
 $("plink").hidden=true;$("pchk").hidden=true;
 try{
  setP("pup",0);
  const name=(outName||"clip4k.mp4").replace(/[^\w.\-]+/g,"_");
  const pre=await zf("/media/presign",{method:"POST",body:{filename:name,contentType:"video/mp4"}});
  if(!safeUrl(pre.uploadUrl)||!safeUrl(pre.publicUrl))throw new ZErr("x","zeother");
  await putBlob(pre.uploadUrl,outBlob,f=>setP("pup",f," "+Math.round(f*100)+"%"));
  setP("ppub",1);
  const body={
   content:$("cap").value,
   mediaItems:[{type:"video",url:pre.publicUrl}],
   platforms:[{platform:"tiktok",accountId:zsel}],
   tiktokSettings:{privacy_level:$("priv").value,allow_comment:$("t-com").checked,allow_duet:$("t-duet").checked,allow_stitch:$("t-stitch").checked,content_preview_confirmed:true,express_consent_given:true},
   publishNow:true
  };
  const j=await zf("/posts",{method:"POST",body});
  lastPost=(j.post&&j.post._id)||"";
  if(!lastPost)throw new ZErr("x","zeother");
  await trackPost(j.post);
 }catch(e){console.error("publish failed",e&&e.code);zsay("pst",e)}
 pbusy=false;pubRefresh();
};

// Старт: ключ после возврата с TikTok (временный) или сохранённый на устройстве
(async()=>{
 if(Q.has("connected")||Q.has("error")){
  const ok=Q.get("connected")==="tiktok";
  if(ok)say("zst","zconn",Q.get("username")?" @"+Q.get("username"):"");
  else say("zst","zfail",Q.get("error_message")?" ["+String(Q.get("error_message")).slice(0,120)+"]":"");
  try{history.replaceState(null,"",location.pathname)}catch(e){}
 }
 const tmp=sget(sessionStorage,SSK);
 if(tmp)sdel(sessionStorage,SSK);
 const saved=sget(localStorage,LSK);
 const k=tmp||saved;
 if(k&&/^sk_\S{16,}$/.test(k)){
  zkey=k;if(saved&&saved===k)$("zrem").checked=true;
  try{await zloadAccounts();zui();if(tmp)$("pub").scrollIntoView({block:"start"})}
  catch(e){zkey="";if(e&&e.code===401)sdel(localStorage,LSK);zui();zsay("zst",e)}
 }
 pubRefresh();
})();
zui();pubRefresh();
