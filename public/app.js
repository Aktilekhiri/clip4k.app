import {addTail,inspectMp4,DEFAULT_PAD} from "./tail.js";

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
const T={ru:{h1:"TikTok 4K загрузчик видео",sub:"Подготовьте ролик в 1080p, 2K или 4K с частотой 60 или 120 кадров для TikTok и Instagram Reels. Обработка идёт в вашем браузере. Видео уходит с устройства только если вы сами опубликуете его в TikTok.",cta:"Выбрать видео",ctasub:"Бесплатно и без регистрации. Лучше всего работает в Chrome и Safari.",chipb:"Обычная загрузка",chipa:"120 fps, чётко",
s1:"Видео",s2:"Обработка",s3:"Скачать",drop:"Выберите видео",dropsub:"Перетащите сюда или нажмите. Любой формат, до 350 МБ.",ql:"Разрешение",fl:"Частота кадров",ll:"Формат",f0:"Как есть",l0:"Как есть",l1:"9:16 размытие",l2:"9:16 чёрный",
n120:"120 fps из ролика 30 или 60 fps дублирует кадры. Файл помечен как 120 fps, но движение плавнее не станет.",tl:"Не перекодировать, только добавить хвост (файл уже должен быть H.264 MP4)",go:"Подготовить видео",dl:"Скачать MP4",
note:"Экспериментальный обходной приём для пересжатия в TikTok. Он меняет структуру MP4-файла. Нет гарантии, что TikTok сохранит качество, и TikTok может изменить это в любой момент.",
pt:"Опубликовать в TikTok",zbadge:"Подключено",psub:"Необязательно. Подключите свой аккаунт Zernio и публикуйте подготовленное видео прямо в TikTok. Ключ Zernio остаётся в этом браузере и отправляется только на zernio.com. У Clip4K нет сервера, он не видит ключ.",zkl:"Ключ API Zernio",zrem:"Запомнить ключ на этом устройстве",zcon:"Подключить",zget:"Получить ключ в Zernio",zout:"Отключить",zadd:"Подключить аккаунт TikTok",zref:"Обновить",accl:"Аккаунт TikTok",phint:"Сначала подготовьте видео в блоке выше, потом вернитесь сюда.",capl:"Подпись",privl:"Кто может смотреть видео",pac:"Разрешить комментарии",pad:"Разрешить дуэты",pas:"Разрешить Stitch",cons:"Я посмотрел видео и проверил подпись. Я согласен опубликовать его в TikTok и принимаю",consl:"Music Usage Confirmation",pubgo:"Опубликовать в TikTok",plink:"Смотреть в TikTok",pprof:"Открыть профиль TikTok",pchk:"Проверить ещё раз",
fq:"Вопросы",q1:"Почему TikTok размывает моё видео?",a1:"TikTok пересжимает каждую загрузку и обычно оставляет качество ниже, чем у вашего файла. Файл H.264 с высоким битрейтом переживает этот шаг с меньшими артефактами.",q4:"Что Clip4K делает с моим файлом?",a4:"Перекодирует ролик в вашем браузере (H.264, высокий битрейт) и дописывает в конец видеодорожки короткий ряд крошечных пустых семплов. Картинка и звук при этом не меняются. В наших тестах TikTok после этого сохранял более высокое качество и битрейт, чем при обычной загрузке. Почему так, TikTok не объясняет, поэтому считайте это обходным приёмом.",q5:"Качество гарантировано?",a5:"Нет. Всё зависит от TikTok, способа публикации и вашего устройства. Из-за лишних данных некоторые плееры и редакторы могут плохо открывать файл. Тогда используйте обычный экспорт.",q6:"120 fps делает видео плавнее?",a6:"Только если исходник тоже 120 fps. Для роликов 30 или 60 fps кадры дублируются: файл помечен как 120 fps, но движение плавнее не становится.",q7:"Что за ключ Zernio и безопасно ли его вставлять?",a7:"Zernio это отдельный сервис, который публикует в TikTok за вас. Ключ вы создаёте в своём аккаунте Zernio и вставляете сюда. Он используется в этом браузере для запросов к zernio.com, а у Clip4K нет сервера, куда его можно отправить. Без «Запомнить» ключ забывается, когда вы закрываете вкладку. Удалить ключ можно в Zernio в любой момент. Пользуйтесь доверенным компьютером или телефоном.",q2:"Видео куда-то загружается?",a2:"Нет. Обработка идёт в вашем браузере. Видео покидает устройство только если вы сами решите опубликовать его в TikTok через свой аккаунт Zernio.",q3:"Почему 4K может быть долго на телефоне?",a3:"Видео обрабатывает ваше устройство. Для длинных 4K роликов используйте компьютер или выберите 1080p.",
sup:"Поддержите автора",supsub:"Сервис бесплатный. Если он помог вашим видео, поддержите автора любой суммой через MBank, O!Bank или PayPal.",pp:"Поддержать через PayPal",gaset:"Настройки аналитики",gatext:"Clip4K может считать посещения через Google Analytics. Ваши видео и ключи туда не попадают.",gano:"Нет, спасибо",gayes:"Разрешить",
pchoose:"— выберите —",pv_PUBLIC_TO_EVERYONE:"Все",pv_MUTUAL_FOLLOW_FRIENDS:"Друзья (взаимные подписки)",pv_FOLLOWER_OF_CREATOR:"Мои подписчики",pv_SELF_ONLY:"Только я",
znet:"Не удалось связаться с Zernio. Проверьте интернет. Если ошибка повторяется, браузер мог заблокировать запрос к zernio.com.",ze401:"Ключ не подошёл. Проверьте его в Zernio.",ze403:"Zernio отказал: аккаунт отключён, публикация не разрешена или превышен лимит тарифа.",ze409:"Такая публикация уже была недавно. Измените подпись и попробуйте снова.",ze429:"Слишком много публикаций за короткое время. Подождите и повторите.",zeother:"Ошибка Zernio.",zbad:"Вставьте ключ целиком. Он начинается с sk_.",zchk:"Проверяем...",zbye:"Ключ удалён из этого браузера.",zno:"Аккаунтов TikTok пока нет. Нажмите «Подключить аккаунт TikTok».",zrecon:"нужно переподключить",zleave:"Вы уйдёте с этой страницы, и подготовленное видео пропадёт. Продолжить? Лучше сначала подключить аккаунт, а потом готовить видео.",znoprof:"В Zernio не найден профиль.",zconn:"TikTok подключён.",zfail:"Не удалось подключить TikTok.",zoff:"Выключено в настройках TikTok-аккаунта",
pnomore:"TikTok сообщает, что этот аккаунт сейчас не может публиковать.",plong:"Видео длиннее, чем разрешено для этого аккаунта",pup:"Загружаем видео",ppub:"Публикуем...",pproc:"TikTok обрабатывает видео. Это может занять несколько минут.",ppubd:"Опубликовано.",ppubw:"Опубликовано. Ищем прямую ссылку на ролик, профиль уже можно открыть.",pproc2:"TikTok всё ещё обрабатывает видео. Нажмите «Проверить ещё раз» через минуту.",ppubd2:"Опубликовано. Прямой ссылки пока нет, откройте профиль или нажмите «Проверить ещё раз».",pfail:"Публикация не удалась.",pretry:"Связь с Zernio пропала, пробуем ещё раз...",zput:"Не удалось загрузить видео в хранилище Zernio",zputnet:"Не удалось загрузить видео в хранилище Zernio. Проверьте интернет.",
big:"Файл больше 350 МБ. Выберите другой.",load:"Запускаем обработку...",work:"Обработка: ",tailwork:"Читаем файл...",tailst:"Добавляем хвост...",done:"Готово. Нажмите «Скачать MP4».",err:"Не получилось обработать видео. Откройте сайт в Chrome или Safari, выберите 1080p или другой файл.",nosup:"Этот браузер не умеет кодировать H.264. Откройте сайт в Chrome, Edge или Safari, либо включите «Не перекодировать» для файла H.264 MP4.",nodec:"Браузер не может прочитать кодек этого видео (часто это HEVC с iPhone). Откройте сайт в Safari или Chrome либо экспортируйте ролик в H.264.",retry:"Устройство не тянет такое разрешение, делаем в 1080p...",retry60:"Устройство не тянет 120 fps, делаем 60 fps...",fmt:"Не удалось прочитать результат. Попробуйте другой файл или выберите 1080p.",tailbad:"Для этого режима нужен обычный H.264 MP4 без фрагментов. Отключите «Не перекодировать».",
inapp:"Вы открыли сайт внутри приложения (Telegram, Instagram и т.п.). Видео здесь не сохранится. Откройте сайт в Safari: нажмите ⋯ или значок компаса и выберите «Открыть в Safari».",inappA:"Вы открыли сайт внутри приложения (Telegram, Instagram и т.п.). Видео здесь может не сохраниться. Нажмите ⋮ и выберите «Открыть в браузере» или «Открыть в Chrome».",iosnote:"В меню выберите «Сохранить видео»."}};
const EN={};document.querySelectorAll("[data-t]").forEach(e=>EN[e.dataset.t]=e.textContent);
T.en={...EN,zoff:"Off in your TikTok account settings",pprof:"Open TikTok profile",
pchoose:"— choose —",pv_PUBLIC_TO_EVERYONE:"Everyone",pv_MUTUAL_FOLLOW_FRIENDS:"Friends (mutual follows)",pv_FOLLOWER_OF_CREATOR:"My followers",pv_SELF_ONLY:"Only me",
znet:"Could not reach Zernio. Check your internet. If this keeps happening, the browser may have blocked the request to zernio.com.",ze401:"The key was not accepted. Check it in Zernio.",ze403:"Zernio refused: the account is disconnected, not allowed to post, or over the plan limit.",ze409:"This post was already published recently. Change the caption and try again.",ze429:"Too many posts in a short time. Wait and try again.",zeother:"Zernio error.",zbad:"Paste the whole key. It starts with sk_.",zchk:"Checking...",zbye:"The key was removed from this browser.",zno:"No TikTok accounts yet. Tap \"Connect a TikTok account\".",zrecon:"needs reconnecting",zleave:"You will leave this page and the prepared video will be lost. Continue? It is better to connect the account first and prepare the video afterwards.",znoprof:"No profile found in Zernio.",zconn:"TikTok connected.",zfail:"Could not connect TikTok.",
pnomore:"TikTok says this account cannot post right now.",plong:"The video is longer than this account allows",pup:"Uploading the video",ppub:"Publishing...",pproc:"TikTok is processing the video. This can take a few minutes.",ppubd:"Published.",ppubw:"Published. Looking for the direct link, the profile is already open to view.",pproc2:"TikTok is still processing the video. Tap \"Check again\" in a minute.",ppubd2:"Published. There is no direct link yet, open the profile or tap \"Check again\".",pfail:"Publishing failed.",pretry:"Lost the connection to Zernio, trying again...",zput:"Could not upload the video to Zernio storage",zputnet:"Could not upload the video to Zernio storage. Check your internet.",
big:"File is over 350 MB. Pick another one.",load:"Starting...",work:"Processing: ",tailwork:"Reading the file...",tailst:"Adding the tail...",done:"Done. Tap \"Download MP4\".",err:"Could not process this video. Open the site in Chrome or Safari, pick 1080p or another file.",nosup:"This browser cannot encode H.264. Open the site in Chrome, Edge or Safari, or tick \"Skip re-encoding\" for an H.264 MP4 file.",nodec:"This browser cannot read this video's codec (often HEVC from an iPhone). Open the site in Safari or Chrome, or export the clip as H.264.",retry:"Your device cannot do this resolution, switching to 1080p...",retry60:"Your device cannot do 120 fps, switching to 60 fps...",fmt:"Could not read the result. Try another file or pick 1080p.",tailbad:"This mode needs a regular H.264 MP4 without fragments. Untick \"Skip re-encoding\".",
inapp:"You opened the site inside an app (Telegram, Instagram, etc.). The video will not save here. Open the site in Safari: tap ⋯ or the compass icon and choose \"Open in Safari\".",inappA:"You opened the site inside an app (Telegram, Instagram, etc.). The video may not save here. Tap ⋮ and choose \"Open in browser\" or \"Open in Chrome\".",iosnote:"Choose \"Save Video\" in the menu."};

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
const LAYOUT=Q.get("layout")==="chunk"?"chunk":"shared";
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
function idle(){if(busy)return;if(h264===false&&!$("tail").checked)say("st","nosup");else if($("st").dataset.k==="nosup")say("st","")}
h264Check.then(idle);

function showWarn(){if(inApp){$("warn").hidden=false;say("warn",isAndroid?"inappA":"inapp")}}
const savedL=sget(localStorage,"clip4k_lang");
const navL=(navigator.languages&&navigator.languages[0])||navigator.language||"";
setL(savedL==="ru"||savedL==="en"?savedL:(/^(ru|ky|kk|uk|be|uz|tg)/i.test(navL)?"ru":"en"));
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
}
$("f").onchange=e=>{pick(e.target.files[0]);e.target.value=""};   // сброс: тот же файл можно выбрать снова
$("tail").onchange=()=>{$("opts").disabled=$("tail").checked;idle()};
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
 const {Input,Output,Conversion,ALL_FORMATS,BlobSource,Mp4OutputFormat,BufferTarget}=await lib();
 const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
 const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
 let w=0,h=0;
 try{const t=await input.getPrimaryVideoTrack();if(t){w=t.displayWidth||0;h=t.displayHeight||0}}catch(e){console.warn(e)}
 const cap=cfg.cap,long=Math.max(w,h);
 const eff=cfg.layout==="asis"&&long?Math.min(cap,long):cap;
 const video={codec:"avc",forceTranscode:true,bitrate:bitrate(eff,cfg.fps)};
 if(cfg.fps)video.frameRate=cfg.fps;
 if(cfg.layout==="asis"){if(long>cap){const v=Math.floor(cap/2)*2;if(h>=w)video.height=v;else video.width=v}}
 else{const H=Math.floor(cap/2)*2,W=Math.floor(cap*9/16/2)*2;video.process=makeLayout(W,H,cfg.layout);video.processedWidth=W;video.processedHeight=H}
 const conv=await Conversion.init({input,output,video});
 const bad=(conv.discardedTracks||[]).find(x=>x.track&&(x.track.type==="video"||(x.track.isVideoTrack&&x.track.isVideoTrack())));
 if(bad&&bad.reason==="undecodable_source_codec")throw new UserErr("nodec");
 if(!conv.isValid||bad)throw new Error("video track unsupported"+(bad?" ("+bad.reason+")":""));
 let last=Date.now(),stallT;
 conv.onProgress=p=>{last=Date.now();const q=Math.max(0,Math.min(1,p));$("pg").style.width=(q*100)+"%";say("st","work",Math.round(q*100)+"% · "+Math.round((Date.now()-t0)/1000)+"s")};
 const stalled=new Promise((_,rej)=>{stallT=setInterval(()=>{if(Date.now()-last>40000){try{conv.cancel&&conv.cancel()}catch(e){}rej(new Error("stalled"))}},3000)});
 try{await Promise.race([conv.execute(),stalled])}finally{clearInterval(stallT)}
 const buf=output.target.buffer;
 if(!buf||!buf.byteLength)throw new Error("empty output");
 return buf;
}
// Если устройство не тянет 120 fps или 4K, отступаем на шаг: сначала fps, потом разрешение.
async function encode(cfg,t0){
 let c={...cfg};
 for(;;){
  try{return await run(c,t0)}
  catch(e){
   if(e instanceof UserErr)throw e;
   console.warn("encode failed",c,e);
   if(c.fps>60){c={...c,fps:60};say("st","retry60")}
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
 busy=true;$("go").disabled=true;$("bar").style.display="block";$("pg").style.width="0";$("dl").disabled=true;
 if(outUrl){URL.revokeObjectURL(outUrl);outUrl=null}
 outBlob=null;pubRefresh();
 stage(2);say("st",tailOnly?"tailwork":"load");
 const t0=Date.now();
 try{
  let buf,fin;
  if(tailOnly){
   buf=new Uint8Array(await file.arrayBuffer());
   try{fin=inspectMp4(buf)}catch(e){console.warn(e);fin={ok:false}}
   if(!fin.ok)throw new UserErr("tailbad");
  }else{
   const raw=await encode({cap:+val("q"),fps:+val("fps"),layout:val("lay")},t0);
   buf=new Uint8Array(raw);
   try{fin=inspectMp4(buf)}catch(e){console.warn(e);fin={ok:false}}
   if(!fin.ok)throw new UserErr("fmt");
  }
  $("pg").style.width="100%";say("st","tailst");
  await new Promise(r=>setTimeout(r,30));
  lastInfo=fin;
  const blob=$("notail").checked?new Blob([buf],{type:"video/mp4"}):addTail(buf,{pad:PAD,layout:LAYOUT}).blob;
  outBlob=blob;outUrl=URL.createObjectURL(blob);
  $("dl").disabled=false;$("dl").classList.remove("ready");void $("dl").offsetWidth;$("dl").classList.add("ready");
  stage(3);pubRefresh();pwarnUpdate();
  const fps=fin.fps?(Math.abs(fin.fps-Math.round(fin.fps))<0.05?Math.round(fin.fps):fin.fps.toFixed(2)):"?";
  say("st","done"," ("+Math.round(fin.width)+"×"+Math.round(fin.height)+", "+fps+" fps, "+(blob.size/1048576).toFixed(1)+" MB, "+Math.round((Date.now()-t0)/1000)+"s)");
  if(isIOS)$("st").dataset.x+=" "+tr("iosnote"),$("st").textContent+=" "+tr("iosnote");
  $("dl").scrollIntoView({behavior:"smooth",block:"center"});
 }catch(e){
  console.error(e);stage(2);
  if(e instanceof UserErr)say("st",e.key);
  else say("st","err"," ["+String((e&&e.message)||e).slice(0,90)+"]");
 }
 busy=false;$("go").disabled=false;
};

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
