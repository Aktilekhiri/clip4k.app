# Фоновое видео для clip4k.app: своя графика (без чужих кадров).
# Сцена: ночная «арена» — небо с красным свечением, город с огнями, перспективная сетка,
# кольцо-прицел с мелкими делениями и цифрами, искры, лучи. Петля 8 с, 30 fps, 1920x1080.
# Мелкие детали специально, чтобы разница «мыло / чётко» была видна.
import math, subprocess, sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
SS = 2                      # рисуем в 2 раза крупнее и уменьшаем — сглаживание
w, h = W * SS, H * SS
FPS, SEC = 30, 8
N = FPS * SEC
HZ = int(h * 0.60)          # линия горизонта
CX = w // 2
OUT = sys.argv[1]

R = (255, 42, 42)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
fnt_s = ImageFont.truetype(FONT, 11 * SS)
fnt_m = ImageFont.truetype(FONT, 14 * SS)
rnd = random.Random(7)

# ---------- статичный фон ----------
def background():
    y = np.linspace(0, 1, h)[:, None]
    top = np.array([4, 4, 6]); mid = np.array([22, 4, 8]); hor = np.array([70, 8, 14])
    k = np.clip(y / (HZ / h), 0, 1)
    sky = top * (1 - k) + mid * k
    glow = np.exp(-((y - HZ / h) ** 2) / 0.004) * (hor - mid)
    img = np.clip(sky + glow, 0, 255)
    img = np.broadcast_to(img[:, None, :], (h, w, 3)).astype(np.float64).copy()
    # радиальное красное свечение за кольцом
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - CX) ** 2 + (yy - h * 0.43) ** 2) / (h * 0.55)
    img += (np.clip(1 - d, 0, 1) ** 2.2)[..., None] * np.array([90, 10, 16])
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    for _ in range(420):                                    # звёзды
        x, yv = rnd.randrange(w), rnd.randrange(int(HZ * 0.8))
        b = rnd.randint(60, 200); s = rnd.choice([1, 1, 2]) * SS // 2 + 1
        dr.rectangle([x, yv, x + s, yv + s], fill=(b, b, b))
    # горы
    for layer, (col, amp, base) in enumerate([((18, 6, 9), 150, HZ - 40), ((10, 4, 6), 90, HZ - 6)]):
        pts = [(0, h)]
        for x in range(0, w + 40, 40):
            yv = base - amp * (0.5 + 0.5 * math.sin(x / (320 + 90 * layer) + layer)) * (0.6 + 0.4 * math.sin(x / 97.0 + layer * 2))
            pts.append((x, yv))
        pts.append((w, h)); dr.polygon(pts, fill=col)
    # город с огнями
    x = -10
    while x < w:
        bw = rnd.randint(40, 130) * SS // 2 * 2
        bh = rnd.randint(60, 300) * SS
        top_y = HZ - bh
        dr.rectangle([x, top_y, x + bw, HZ], fill=(7, 6, 9))
        dr.line([x, top_y, x + bw, top_y], fill=(60, 14, 18), width=SS)
        for wy in range(top_y + 8 * SS, HZ - 4 * SS, 9 * SS):
            for wx in range(x + 5 * SS, x + bw - 6 * SS, 7 * SS):
                if rnd.random() < 0.42:
                    c = rnd.random()
                    col = (255, 190, 120) if c < 0.6 else (255, 60, 60) if c < 0.85 else (235, 235, 245)
                    f = rnd.uniform(0.35, 1.0)
                    dr.rectangle([wx, wy, wx + 3 * SS, wy + 4 * SS], fill=tuple(int(v * f) for v in col))
        if rnd.random() < 0.3:                               # антенна с огнём
            ax = x + bw // 2
            dr.line([ax, top_y, ax, top_y - 30 * SS], fill=(40, 30, 34), width=SS)
            dr.ellipse([ax - 3 * SS, top_y - 33 * SS, ax + 3 * SS, top_y - 27 * SS], fill=R)
        x += bw + rnd.randint(2, 10) * SS
    # пол под горизонтом
    dr.rectangle([0, HZ, w, h], fill=(6, 3, 5))
    return im

BG = background()

# искры (периодичные, чтобы петля была бесшовной)
SP = [dict(x=rnd.uniform(0, w), ph=rnd.random(), sp=rnd.choice([1, 1, 2, 3]), sz=rnd.uniform(1, 3) * SS,
           drift=rnd.uniform(-40, 40) * SS) for _ in range(260)]

def frame(i):
    t = i / N                                               # 0..1 по петле
    im = BG.copy()
    dr = ImageDraw.Draw(im, "RGBA")
    # лучи прожекторов
    for k, base in enumerate([0.28, 0.72]):
        a = math.sin(2 * math.pi * (t + k * 0.5)) * 0.35
        x0 = w * base; L = h * 1.1
        x1 = x0 + math.sin(a) * L; y1 = HZ - math.cos(a) * L
        for wd, al in [(140, 10), (70, 14), (24, 22)]:
            dx = math.cos(a) * wd * SS; dy = math.sin(a) * wd * SS
            dr.polygon([(x0, HZ), (x1 - dx, y1 - dy), (x1 + dx, y1 + dy)], fill=(255, 40, 50, al))
    # перспективная сетка
    for k in range(-26, 27):
        dr.line([CX + k * 18 * SS, HZ, CX + k * 210 * SS, h], fill=(255, 40, 50, 70), width=SS)
    for k in range(18):
        z = ((k + t * 3) % 18) / 18                          # движение к зрителю, 3 линии за петлю
        yv = HZ + (h - HZ) * z ** 2.2
        dr.line([0, yv, w, yv], fill=(255, 40, 50, int(30 + 150 * z)), width=SS)
    dr.line([0, HZ, w, HZ], fill=(255, 70, 80, 200), width=2 * SS)
    # кольцо-прицел
    cy = int(h * 0.43); rad = int(h * 0.25)
    rot = 2 * math.pi * t / 4                               # четверть оборота за петлю: деления повторяются каждые 90°
    for rr, wd, al in [(rad, 3, 230), (rad - 22 * SS, 1, 160), (rad + 26 * SS, 1, 120), (rad - 70 * SS, 1, 90)]:
        dr.ellipse([CX - rr, cy - rr, CX + rr, cy + rr], outline=(255, 50, 60, al), width=wd * SS)
    for d in range(0, 360, 2):
        ang = math.radians(d) + rot
        ln = (18 if d % 30 == 0 else 10 if d % 10 == 0 else 5) * SS
        r1 = rad - 4 * SS; r2 = r1 - ln
        dr.line([CX + r1 * math.cos(ang), cy + r1 * math.sin(ang), CX + r2 * math.cos(ang), cy + r2 * math.sin(ang)],
                fill=(255, 220, 220, 230 if d % 30 == 0 else 150), width=SS)
        if d % 30 == 0:
            r3 = rad + 44 * SS
            dr.text((CX + r3 * math.cos(ang), cy + r3 * math.sin(ang)), f"{d:03d}", font=fnt_s, fill=(255, 200, 200, 210), anchor="mm")
    # внутренняя дуга, крутится навстречу
    a0 = -360 * t * 2
    dr.arc([CX - rad + 46 * SS, cy - rad + 46 * SS, CX + rad - 46 * SS, cy + rad - 46 * SS], a0, a0 + 110, fill=(255, 60, 70, 240), width=4 * SS)
    dr.arc([CX - rad + 46 * SS, cy - rad + 46 * SS, CX + rad - 46 * SS, cy + rad - 46 * SS], a0 + 180, a0 + 230, fill=(255, 60, 70, 200), width=4 * SS)
    # перекрестие и мелкий текст (детали для сравнения резкости)
    dr.line([CX - 30 * SS, cy, CX + 30 * SS, cy], fill=(255, 230, 230, 200), width=SS)
    dr.line([CX, cy - 30 * SS, CX, cy + 30 * SS], fill=(255, 230, 230, 200), width=SS)
    for j, s in enumerate(["SIGNAL 99.8%", "BITRATE ▮▮▮▮▮▮▮▯", f"FRAME {i % FPS + 1:02d}/{FPS}"]):
        dr.text((CX - rad - 40 * SS, cy + rad + (24 + 18 * j) * SS), s, font=fnt_m, fill=(255, 210, 210, 200), anchor="rm")
    for j, s in enumerate(["2160 × 3840", "H.264 HIGH", "60.00 FPS"]):
        dr.text((CX + rad + 40 * SS, cy + rad + (24 + 18 * j) * SS), s, font=fnt_m, fill=(255, 210, 210, 200), anchor="lm")
    # искры
    for p in SP:
        z = (p["ph"] + t * p["sp"]) % 1
        yv = h - z * (h * 0.95); xv = p["x"] + math.sin(z * 6.283 + p["ph"] * 9) * p["drift"]
        al = int(255 * (1 - z) ** 0.6)
        s = p["sz"]
        dr.ellipse([xv - s, yv - s, xv + s, yv + s], fill=(255, 120 + int(80 * (1 - z)), 90, al))
    return im.resize((W, H), Image.LANCZOS)

ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", OUT], stdin=subprocess.PIPE)
for i in range(N):
    ff.stdin.write(frame(i).tobytes())
    if i % 40 == 0: print("frame", i, flush=True)
ff.stdin.close(); ff.wait()
print("done", OUT)
