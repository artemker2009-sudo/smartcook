#!/usr/bin/env python3
"""
Генератор стартового экрана iOS (ios/App/App/Assets.xcassets/Splash.imageset).

Зачем скрипт, а не «нарисовали руками». Прошлый сплэш был иконкой, положенной
по центру белого полотна: на телефоне это выглядело как маленькая зелёная
плитка посреди пустого экрана — будто приложение не загрузилось. Правильный
сплэш заливает экран целиком, поэтому его нельзя просто «взять из иконки», его
надо собрать. Чтобы через полгода это можно было повторить, сборка описана
кодом.

Что делает:
  1. Берёт appstore/icon-1024.png (единственный источник правды по бренду).
  2. Вырезает из неё белый колпак по маске яркости — сам колпак в иконке
     чисто белый, фон зелёный, поэтому порога по яркости достаточно.
  3. Заливает квадрат 2732×2732 диагональным градиентом: #0E8A60 в левом
     нижнем углу, светлее к правому верхнему — то же направление, что в иконке.
  4. Кладёт колпак по центру.

Размер 2732×2732 и три одинаковых файла (1x/2x/3x) — требование шаблона
Capacitor: изображение квадратное с запасом, а LaunchScreen.storyboard
показывает его с contentMode=scaleAspectFill, обрезая по краям под любой экран.

Запуск (из корня репозитория):
    python3 appstore/make-splash.py
"""

from PIL import Image

ICON = "appstore/icon-1024.png"
OUT_DIR = "ios/App/App/Assets.xcassets/Splash.imageset"
OUT_FILES = ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]

SIZE = 2732
# Левый нижний угол — базовый цвет бренда, правый верхний — светлее.
# Направление и размах взяты с иконки, но чуть мягче: на весь экран резкий
# градиент читается как дефект печати.
COLOR_DARK = (14, 138, 96)    # #0E8A60
COLOR_LIGHT = (66, 194, 132)
# Доля ширины КВАДРАТА (не экрана), которую занимает колпак.
#
# Важно не перепутать: сториборд показывает квадрат с contentMode=scaleAspectFill,
# то есть на высоком экране картинка масштабируется по ВЫСОТЕ и обрезается по
# бокам. На 6.9" (1320×2868) в кадр попадает лишь ~46% ширины исходника, и
# колпак оптически увеличивается примерно вдвое. При 0.34 он занимал три
# четверти ширины экрана и выглядел распирающим — проверено скриншотом
# симулятора. 0.23 даёт примерно половину ширины экрана: заметно, но спокойно.
HAT_WIDTH_RATIO = 0.23
# Порог «это белый пиксель колпака». Колпак в иконке — чистый #ffffff,
# зелёный фон даже в самом светлом углу заметно темнее, так что 200 с запасом.
WHITE_THRESHOLD = 200


def extract_hat(icon: Image.Image) -> Image.Image:
    """Белый колпак с прозрачным фоном, обрезанный по своим границам."""
    icon = icon.convert("RGB")
    w, h = icon.size
    px = icon.load()
    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # Плавный край: между порогом и белым альфа растёт линейно, иначе
            # на масштабировании вылезает пиксельная лесенка.
            level = min(r, g, b)
            if level >= 255:
                mpx[x, y] = 255
            elif level > WHITE_THRESHOLD:
                mpx[x, y] = int((level - WHITE_THRESHOLD) * 255 / (255 - WHITE_THRESHOLD))
    hat = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    hat.putalpha(mask)
    bbox = mask.getbbox()
    if not bbox:
        raise SystemExit("Не нашёл белый колпак в иконке — проверь ICON и WHITE_THRESHOLD")
    return hat.crop(bbox)


def build_gradient(size: int) -> Image.Image:
    """Диагональный градиент: тёмный левый низ → светлый правый верх."""
    grad = Image.new("RGB", (size, size))
    gpx = grad.load()
    for y in range(size):
        for x in range(size):
            # t = 0 в левом нижнем углу, 1 в правом верхнем.
            t = (x / (size - 1) + (size - 1 - y) / (size - 1)) / 2
            gpx[x, y] = tuple(
                round(COLOR_DARK[i] + (COLOR_LIGHT[i] - COLOR_DARK[i]) * t) for i in range(3)
            )
    return grad


def main() -> None:
    icon = Image.open(ICON)
    hat = extract_hat(icon)

    target_w = round(SIZE * HAT_WIDTH_RATIO)
    target_h = round(hat.height * target_w / hat.width)
    hat = hat.resize((target_w, target_h), Image.LANCZOS)

    splash = build_gradient(SIZE).convert("RGBA")
    splash.alpha_composite(hat, ((SIZE - target_w) // 2, (SIZE - target_h) // 2))
    splash = splash.convert("RGB")

    for name in OUT_FILES:
        splash.save(f"{OUT_DIR}/{name}", "PNG")
        print("записал", f"{OUT_DIR}/{name}")


if __name__ == "__main__":
    main()
