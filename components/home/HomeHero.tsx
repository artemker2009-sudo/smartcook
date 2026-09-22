"use client";

import Image from "next/image";
import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { reachGoal } from "@/lib/metrika";

/**
 * Первый экран Главной (v2, утверждённый макет): фотография продуктов на весь
 * верх, название по центру наверху, обещание и ОДНА белая кнопка внизу — прямо
 * на снимке.
 *
 * Чем отличается от прежнего первого экрана (components/HeroLanding.tsx,
 * компонент оставлен в репозитории): текст переехал НА фотографию, поэтому
 * читаемость держит не световое пятно под буквами, а тёмная вуаль в нижней
 * половине снимка — там, где лежит текст. Сверху снимок, наоборот, мягко
 * проявляется из цвета фона страницы, чтобы у фотографии не было видимой
 * верхней кромки.
 *
 * ПРО ВЫРЕЗ (см. #150, #156 и app/globals.safeArea.test.ts). Вырез
 * ПРИБАВЛЯЕТСЯ к высоте снимка, а не съедает её: ниже безопасной зоны
 * раскладка остаётся пиксель в пиксель такой же, как на Android, в TWA и на
 * iPhone SE, а на iPhone с Dynamic Island всё это просто сдвигается вниз ровно
 * на высоту выреза. Название при этом не оказывается под часами, кнопка не
 * уезжает за нижнюю кромку снимка, а сам снимок не обрезается.
 *
 * Про загрузку. Снимок — LCP-кадр Главной. Штатный priority у next/image не
 * подходит: он преднагружает файл из src (WebP), а <picture> в браузере с AVIF
 * рисует другой — качались бы оба. Поэтому priority разобран на части: eager +
 * fetchPriority здесь, а типизированная преднагрузка AVIF живёт в серверном
 * app/page.tsx, откуда попадает в <head> первого же ответа.
 */
export default function HomeHero() {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Имя цели НЕ меняем: на cta_photo_click собрана вся воронка входа по фото.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  const handleTextClick = () => {
    // home_text_click — новая цель Главной v2. Прежние две остаются: на
    // cta_text_click собрана история этой же ссылки, а nav_search — общая цель
    // входа в поиск (её же шлёт таб-бар).
    reachGoal("home_text_click");
    reachGoal("cta_text_click");
    reachGoal("nav_search");
    router.push("/search?focus=text");
  };

  return (
    <section className="home-hero">
      {/* Декоративный фон: alt пустой — картинка ничего не сообщает сверх
          заголовка, и скринридеру читать её незачем. */}
      <div className="home-hero-photo" aria-hidden>
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
            className="home-hero-img"
          />
        </picture>
      </div>
      {/* Две вуали: сверху снимок проявляется из фона страницы, снизу уходит в
          темноту под текстом. Обе декоративные. */}
      <div className="home-hero-top-fade" aria-hidden />
      <div className="home-hero-shade" aria-hidden />

      <div className="home-hero-brand">
        {/* Иконка приложения, пережатая ровно под этот размер (92px = 46@2x,
            1.2 КБ). Исходный /icon-192.png сюда не годится: он весит 46 КБ,
            больше самой фотографии первого экрана, а React преднагружает
            картинки первого экрана — и этот довесок отнимал бы канал у
            LCP-кадра. */}
        <img
          src="/hero/app-icon-92.webp"
          alt=""
          width={46}
          height={46}
          className="home-hero-mark"
          aria-hidden
        />
        <span className="home-hero-word">SmartCook</span>
      </div>

      <div className="home-hero-copy">
        <h1 className="home-hero-title">Ужин из того, что есть дома</h1>
        <p className="home-hero-sub">
          Сфотографируйте продукты — подберём три рецепта за минуту.
        </p>
        <button type="button" className="home-hero-cta" onClick={handlePhotoClick}>
          <Camera size={22} aria-hidden /> Сфотографировать продукты
        </button>
        <button type="button" className="home-hero-textlink" onClick={handleTextClick}>
          или напишите, что есть
        </button>
      </div>
    </section>
  );
}
