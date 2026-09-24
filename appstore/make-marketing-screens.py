#!/usr/bin/env python3
"""Маркетинговые скриншоты App Store: заголовок + телефон на зелёном градиенте.

Вход:  appstore/screens-raw/*.png (1320×2868, симулятор iPhone 17 Pro Max)
Выход: appstore/screens-final/01.png … 06.png (номер = порядок в App Store)

Шрифт: Unbounded Bold (variable TTF с Google Fonts). В репозитории его нет
(в public/fonts лежит только латиница Manrope), путь передаётся аргументом:
  curl -L -o Unbounded.ttf "https://github.com/google/fonts/raw/main/ofl/unbounded/Unbounded%5Bwght%5D.ttf"
  python3 appstore/make-marketing-screens.py --font Unbounded.ttf
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "screens-raw")
OUT = os.path.join(ROOT, "screens-final")

W, H = 1320, 2868
TOP, BOTTOM = (0x0E, 0x8A, 0x60), (0x0A, 0x5F, 0x42)

TITLE_TOP = 150
TITLE_SIZE = 88  # один кегль на все шесть, не уменьшаем — сокращаем текст
LINE_HEIGHT = 1.15
SIDE = 90
MAX_LINES = 2

PHONE_GAP = 110
# Телефон крупнее холста по высоте: низ режется краем, пустого фона под ним нет.
# Берём первую ширину экрана, при которой телефон доходит до низа.
SCREEN_WIDTHS = (1160, 1220)
# Dynamic Island в кадрах занимает строки 42–151, поэтому срез 130 оставлял бы
# чёрную полоску; 156 убирает статус-бар целиком. Больше — если важное уезжает вниз.
CROP_TOP = {}
CROP_TOP_DEFAULT = 156
RADIUS = 56
BORDER = 10
SHADOW_ALPHA = int(255 * 0.25)
SHADOW_BLUR = 60
SHADOW_DY = 24

# Неразрывный пробел перед тире: тире не должно начинать строку.
NB = " "
SCREENS = [
    ("photo-result", f"Фото продуктов{NB}— три рецепта"),
    ("recipe", "Граммы, время, калории"),
    ("shopping", "Список покупок для всей семьи"),
    ("home", "Ужин из того, что есть"),
    ("cooking", "Телефон читает вслух"),
    ("missing", f"Чего не хватает{NB}— одной кнопкой"),
]


def load_font(path, size):
    font = ImageFont.truetype(path, size)
    names = [n.decode() if isinstance(n, bytes) else n for n in font.get_variation_names()]
    if "Bold" in names:
        font.set_variation_by_name("Bold")
    return font


def text_width(font, s):
    return font.getlength(s.replace(NB, " "))


def best_split(font, text, max_w):
    """Самое ровное разбиение на ≤ MAX_LINES строк, влезающих в max_w; None — не влезло."""
    if text_width(font, text) <= max_w:
        return [text]
    words = text.split(" ")
    best = None
    for i in range(1, len(words)):
        lines = [" ".join(words[:i]), " ".join(words[i:])]
        widest = max(text_width(font, l) for l in lines)
        if widest <= max_w and (best is None or widest < best[0]):
            best = (widest, lines)
    return best[1] if best else None


def gradient():
    col = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return col.resize((W, H))


def top_rounded_mask(w, h, r, ss=4):
    """Скругление только сверху (низ уходит за край холста); на 4× — без ступенек."""
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * ss - 1, (h + r) * ss), r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def phone(name, screen_w, visible_h):
    """Телефон высотой visible_h: белая рамка сверху и по бокам, низ срезан краем холста."""
    crop_top = CROP_TOP.get(name, CROP_TOP_DEFAULT)
    shot = Image.open(os.path.join(RAW, f"{name}.png")).convert("RGB")
    shot = shot.crop((0, crop_top, shot.width, shot.height))
    scale = screen_w / shot.width
    screen = shot.resize((screen_w, round(shot.height * scale)), Image.LANCZOS)

    ow = screen_w + 2 * BORDER
    screen_vis = visible_h - BORDER
    assert screen.height >= screen_vis, f"{name}: кадр кончается выше низа холста"
    screen = screen.crop((0, 0, screen_w, screen_vis))
    # Сколько строк сырого кадра осталось за нижним краем.
    lost_raw = shot.height - round(screen_vis / scale)

    body = Image.new("RGBA", (ow, visible_h), (0, 0, 0, 0))
    frame_mask = top_rounded_mask(ow, visible_h, RADIUS + BORDER)
    body.paste((255, 255, 255, 255), (0, 0, ow, visible_h), frame_mask)
    body.paste(screen, (BORDER, BORDER), top_rounded_mask(screen_w, screen_vis, RADIUS))
    return body, frame_mask, crop_top, lost_raw


def luminance(rgb):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True, help="путь к Unbounded[wght].ttf")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    bg = gradient()
    font = load_font(args.font, TITLE_SIZE)
    ascent, _ = font.getmetrics()

    too_long = [t for _, t in SCREENS if not best_split(font, t, W - 2 * SIDE)]
    for t in too_long:
        print(f"ПРОПУСК: не влезает в 2 строки при {TITLE_SIZE}px — «{t.replace(NB, ' ')}»")

    line_h = TITLE_SIZE * LINE_HEIGHT

    def layout(lines):
        """Строки заголовка: (текст, x, baseline) и вертикальные границы букв."""
        # Однострочный заголовок центрируем внутри двухстрочного блока.
        y0 = TITLE_TOP + (MAX_LINES - len(lines)) * line_h / 2
        rows, ink_top, ink_bottom = [], H, 0
        for n, line in enumerate(lines):
            s = line.replace(NB, " ")
            x = (W - font.getlength(s)) / 2
            baseline = y0 + n * line_h + (line_h - TITLE_SIZE) / 2 + ascent
            l, t, r, b = font.getbbox(s, anchor="ls")
            assert x + l >= SIDE - 1 and x + r <= W - SIDE + 1, (line, x + l, x + r)
            rows.append((s, x, baseline))
            ink_top, ink_bottom = min(ink_top, baseline + t), max(ink_bottom, baseline + b)
        return rows, ink_top, ink_bottom

    layouts = {}
    for name, title in SCREENS:
        lines = best_split(font, title, W - 2 * SIDE)
        if lines:
            layouts[name] = (lines, *layout(lines))
    # Отступ 110 — от самой низкой буквы (выносные «у», «й») среди всех кадров,
    # чтобы телефоны стояли на одной высоте во всей галерее.
    phone_top = round(max(v[3] for v in layouts.values()) + PHONE_GAP)
    visible_h = H - phone_top

    for i, (name, title) in enumerate(SCREENS, 1):
        if name not in layouts:
            continue
        lines, rows, ink_top, ink_bottom = layouts[name]
        canvas = bg.copy().convert("RGBA")
        draw = ImageDraw.Draw(canvas)
        for s, x, baseline in rows:
            draw.text((x, baseline), s, font=font, fill="white", anchor="ls")

        # Первая ширина, при которой экран (после среза сверху) дотягивается до низа холста.
        crop_top = CROP_TOP.get(name, CROP_TOP_DEFAULT)
        screen_w = next(
            w for w in SCREEN_WIDTHS if (H - crop_top) * w / W >= visible_h - BORDER
        )
        body, frame_mask, crop_top, lost_raw = phone(name, screen_w, visible_h)
        px = (W - body.width) // 2

        # Тень только по бокам: источник начинается ниже верхних углов,
        # а всё, что размытие дотянуло выше верха телефона, обнуляем.
        shadow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(shadow).rectangle(
            (px, phone_top + SHADOW_DY + 2 * RADIUS, px + body.width - 1, H + 3 * SHADOW_BLUR), fill=SHADOW_ALPHA
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR / 2))
        shadow.paste(0, (0, 0, W, phone_top))
        canvas.paste((0, 0, 0), (0, 0, W, H), shadow)
        canvas.alpha_composite(body, (px, phone_top))

        out = canvas.convert("RGB")
        out.save(os.path.join(OUT, f"{i:02d}.png"), optimize=True)

        worst = min(contrast((255, 255, 255), bg.getpixel((W // 2, y))) for y in range(int(ink_top), int(ink_bottom) + 1))
        print(
            f"{i:02d}.png  {name:13s} {out.size[0]}×{out.size[1]} {out.mode}  строк {len(lines)}  "
            f"текст {ink_top}–{ink_bottom}px  телефон {screen_w}px с {phone_top}px (блок заголовка до {phone_top - PHONE_GAP})  "
            f"срез сверху {crop_top}, за краем {lost_raw}px кадра  контраст ≥{worst:.2f}:1  | {' / '.join(lines)}"
        )


if __name__ == "__main__":
    main()
