"use client";

import Image from "next/image";
import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { reachGoal } from "@/lib/metrika";

/**
 * Первый экран Главной (H11 «одно обещание, одна кнопка» + визуальная
 * доработка): фотография свежих продуктов во всю ширину, логотип, обещание,
 * ОДНА крупная кнопка и тихая ссылка на текстовый ввод. Контент прижат к верху
 * (padding-top ~12% высоты экрана), а не отцентрован: под ссылкой в тот же
 * экран должен входить блок «Как это работает».
 *
 * Фон — фотография с Unsplash (свободная лицензия, коммерческое использование
 * разрешено, атрибуция не требуется):
 *   https://unsplash.com/photos/bRdRUUtbxO0 — Nathan Dumlao
 * Кадр обрезан и пережат в WebP и AVIF (public/hero/). Ни людей, ни чужого
 * брендинга в кадре нет, картинка не сгенерирована ИИ.
 *
 * Читаемость. Сплошной заливки поверх снимка почти нет — только лёгкая дымка
 * 22%, овощи должны быть видны. Контраст текста держат ЛОКАЛЬНЫЕ световые
 * пятна: мягкое белое сияние под шапкой и под парой «заголовок +
 * подзаголовок», сходящее на нет к краям. Единственный переход на первом
 * экране — уход фотографии в цвет фона страницы в нижней четверти; никаких
 * горизонтальных кромок выше (шапка прозрачная, своей полосы у неё нет).
 * Замер по худшей точке под буквами: заголовок 6.6:1, подзаголовок 5.3:1,
 * логотип 6.1:1 при пороге AA 4.5.
 *
 * Про загрузку. Снимок — LCP-кадр Главной, его надо тянуть первым. Штатный
 * priority у next/image здесь НЕ подходит: он преднагружает ровно тот файл,
 * что стоит в src (WebP), а <picture> в браузере с AVIF рисует другой — в
 * замере качались оба, 90 + 81 КБ вместо одного. Поэтому priority разобран на
 * части: eager + fetchPriority здесь, а типизированная преднагрузка
 * (type="image/avif") живёт в серверном app/page.tsx — только оттуда она
 * гарантированно попадает в <head> ПЕРВОГО ответа, а не появляется после
 * гидрации. Браузер без поддержки AVIF её пропустит и возьмёт WebP из <img>.
 *
 * Переходы навигационные, разделы — реальные роуты: фото → /search?focus=photo
 * (фокус на зоне загрузки), текст → /search?focus=text (фокус на поле ввода).
 */
export default function HeroLanding() {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, переход всё равно сработает.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  const handleTextClick = () => {
    // cta_text_click — новая цель именно этой ссылки (меряем, сколько людей
    // выбирают текст вместо фото). nav_search шлём следом и НЕ переименовываем:
    // это та же цель, что у таб-бара, на ней собрана воронка входа в поиск.
    reachGoal("cta_text_click");
    reachGoal("nav_search");
    router.push("/search?focus=text");
  };

  return (
    <section className="hero-screen">
      {/* Декоративный фон: alt пустой, чтобы скринридер не читал картинку,
          которая ничего не сообщает сверх заголовка. */}
      <div className="hero-photo" aria-hidden>
        <picture>
          <source srcSet="/hero/fresh-produce.avif" type="image/avif" />
          <Image
            src="/hero/fresh-produce.webp"
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            className="hero-photo-img"
          />
        </picture>
      </div>

      <BrandLogo />

      {/* Заголовок и подзаголовок лежат на общем световом пятне
          (.hero-copy::before) — оно и держит контраст поверх снимка. */}
      <div className="hero-copy">
        <span className="hero-copy-glow" aria-hidden />
        <h1 className="hero-headline">Ужин из того, что есть</h1>
        <p className="hero-subhead">
          Сфотографируйте продукты — три рецепта за минуту.
        </p>
      </div>

      <button type="button" className="btn-primary hero-cta" onClick={handlePhotoClick}>
        <Camera size={22} /> Сфотографировать холодильник
      </button>
      <button type="button" className="hero-textlink" onClick={handleTextClick}>
        или напишите, что есть
      </button>
    </section>
  );
}
