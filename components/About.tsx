"use client";

import React from "react";
import Link from "next/link";
import {
  Camera,
  Volume2,
  ShoppingCart,
  PartyPopper,
  Send,
  Mail,
  Users,
  KeyRound,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { isNativePlatform, openExternal, useIsNative } from "@/lib/native";
import { RUSTORE_URL, TELEGRAM_URL, SUPPORT_EMAIL, VK_URL } from "@/lib/constants";
import NativeDocsLinks from "@/components/NativeDocsLinks";

// «О проекте» — ОДНА страница на веб и приложение.
//
// Раньше их было две и они жили своей жизнью: /about с сухим текстом и эта
// карточка «Кухонная революция», доступная только из меню внутри экрана поиска.
// Теперь контент один: /about рендерит этот же компонент, а меню поиска
// показывает его же. Правишь в одном месте — меняется везде.
//
// Чего здесь больше нет и не должно появиться: блока «Вы теряете 30.000₽» и
// прочих цифр, которые никто не считал. Плитки «Zero Waste» и «Разнообразие»
// убраны туда же — они ничего не сообщали.
//
// Мобильный экран — основной: одна колонка, крупные заголовки, воздух между
// секциями. Разметка на классах .about-* (globals.css), а не на инлайновых
// стилях, потому что нужны медиазапросы.

type Feature = { icon: React.ReactNode; title: string; text: string };

const FEATURES: Feature[] = [
  {
    icon: <Camera size={22} />,
    title: "По фото",
    text: "Снимите продукты — ИИ распознает их и предложит рецепты.",
  },
  {
    icon: <Volume2 size={22} />,
    title: "Готовим!",
    text: "Читает шаги вслух — руки остаются свободными.",
  },
  {
    icon: <ShoppingCart size={22} />,
    title: "Покупки",
    text: "Списки голосом, текстом и по фото. Общий список с семьёй.",
  },
  {
    icon: <PartyPopper size={22} />,
    title: "Банкеты",
    text: "Меню на праздник за минуту, пожелания гостей — по ссылке.",
  },
];

const PRINCIPLES: { icon: React.ReactNode; text: React.ReactNode }[] = [
  {
    icon: <KeyRound size={20} />,
    text: (
      <>
        <strong>Без email и телефона</strong> — только имя и пароль.
      </>
    ),
  },
  {
    icon: <Sparkles size={20} />,
    text: (
      <>
        <strong>Рецепты составляет ИИ</strong> — проверяйте состав на аллергены.
      </>
    ),
  },
  {
    icon: <ShieldCheck size={20} />,
    text: (
      <>
        <strong>Никакого фейка</strong> — ни накрученных отзывов, ни выдуманных цифр.
      </>
    ),
  },
];

// Внешняя ссылка: в нативной оболочке уходит в системный браузер, иначе
// пользователь оказывается «в браузере внутри приложения» (App Store 4.2).
function openExternalOnNative(e: React.MouseEvent, url: string) {
  if (isNativePlatform()) {
    e.preventDefault();
    void openExternal(url);
  }
}

export default function About() {
  // Блок «Скачать» в нативной сборке не рендерится ВООБЩЕ. Это не вкусовщина:
  // App Store 2.3.10 запрещает упоминать другие магазины приложений, и ссылка
  // на RuStore внутри iOS-сборки — готовый повод для отказа.
  const isNative = useIsNative();

  return (
    <div className="about">
      {/* 1. Заголовок */}
      <header className="about-hero">
        <h1 className="about-hero-title">Рецепты из того, что есть дома</h1>
        <p className="about-hero-text">
          SmartCook — для вечера, когда открываешь холодильник и не знаешь, что
          приготовить. Сфотографируйте продукты — получите три варианта ужина.
          Без покупки лишнего, без долгого выбора.
        </p>
      </header>

      {/* 2. Что умеет */}
      <section className="about-section">
        <h2 className="about-h2">Что умеет</h2>
        <div className="about-cards">
          {FEATURES.map((f) => (
            <div key={f.title} className="about-card">
              <span className="about-card-icon" aria-hidden>
                {f.icon}
              </span>
              <div>
                <div className="about-card-title">{f.title}</div>
                <p className="about-card-text">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Кто делает */}
      <section className="about-section">
        <h2 className="about-h2">Кто делает</h2>
        <div className="about-card about-card-plain">
          <p className="about-author">
            Меня зовут Артём Кернасовский, мне 17, учусь в 11 классе. SmartCook
            делаю один: от идеи до кода. Проект представлял на конференциях
            «Наука для жизни» и «Business skills», в МТПП. В интернете меня
            знают как KERNAS.
          </p>
        </div>
      </section>

      {/* 4. Как мы работаем */}
      <section className="about-section">
        <h2 className="about-h2">Как мы работаем</h2>
        <ul className="about-principles">
          {PRINCIPLES.map((p, i) => (
            <li key={i} className="about-principle">
              <span className="about-principle-icon" aria-hidden>
                {p.icon}
              </span>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Связь */}
      <section className="about-section">
        <h2 className="about-h2">Связь</h2>
        <div className="about-links">
          <a
            className="about-link"
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternalOnNative(e, TELEGRAM_URL)}
          >
            <span className="about-link-icon" aria-hidden>
              <Send size={20} />
            </span>
            <span>
              <span className="about-link-title">Telegram-канал</span>
              <span className="about-link-sub">t.me/smartcook2026</span>
            </span>
          </a>

          {/* mailto оставляем обычной ссылкой: WKWebView сам открывает почтовый
              клиент, а Browser.open на mailto-схеме не сработает. */}
          <a className="about-link" href={`mailto:${SUPPORT_EMAIL}`}>
            <span className="about-link-icon" aria-hidden>
              <Mail size={20} />
            </span>
            <span>
              <span className="about-link-title">Почта</span>
              <span className="about-link-sub">{SUPPORT_EMAIL}</span>
            </span>
          </a>

          <a
            className="about-link"
            href={VK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternalOnNative(e, VK_URL)}
          >
            <span className="about-link-icon" aria-hidden>
              <Users size={20} />
            </span>
            <span>
              <span className="about-link-title">Сообщество ВКонтакте</span>
              <span className="about-link-sub">vk.ru/smartcookpro</span>
            </span>
          </a>
        </div>
      </section>

      {/* 6. Скачать — ТОЛЬКО в вебе (App Store 2.3.10) */}
      {!isNative && (
        <section className="about-section">
          <h2 className="about-h2">Скачать</h2>
          <div className="about-stores">
            <a
              className="about-store"
              href={RUSTORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="about-store-mark" aria-hidden>
                RS
              </span>
              <span>
                <span className="about-store-title">RuStore</span>
                <span className="about-store-sub">Android — установить</span>
              </span>
            </a>

            {/* Место под бейдж App Store. Пока приложение на проверке — плашка
                неактивна и ничего не обещает по срокам. */}
            <div className="about-store about-store-soon" aria-disabled="true">
              <span className="about-store-mark" aria-hidden>
                iOS
              </span>
              <span>
                <span className="about-store-title">App Store</span>
                <span className="about-store-sub">iPhone — скоро</span>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 7. Документы */}
      <NativeDocsLinks variant="block" always />

      {/* Ссылка на поддержку — единственное, что не поместилось в блоки выше,
          но нужно человеку с проблемой. */}
      <p className="about-footnote">
        Что-то не работает? Напишите нам через <Link href="/support">Поддержку</Link>.
      </p>
    </div>
  );
}
