"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, Lightbulb, Search, ShoppingCart, User } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { isChromeHidden } from "@/lib/layoutGate";
import { FEATURE_IDEAS } from "@/lib/features";
import { TAB_RESELECT_EVENT, isTabReselect, type TabReselectDetail } from "@/lib/tabBarEvents";

// Основная навигация по четырём разделам. Мобайл — фиксированный таб-бар снизу
// (safe-area для PWA/iOS), десктоп — те же пункты в верхней шапке (через CSS).
// Переходы — next/link (реальная смена маршрута → авто-хит Метрики из
// YandexMetrika по usePathname). onClick дополнительно шлёт цель nav_*.
//
// Порядок: Главная — Идеи — Поиск — Покупки — Профиль.
//
// «Поиск» (бывшая «По фото») ведёт на чистый /search и шлёт СТАРУЮ цель
// nav_search: на ней собрана воронка входа в поиск, переименование разорвало бы
// месячные ряды. Раньше пункт назывался «По фото» и открывал /search?focus=photo
// (сразу зона загрузки фото) — теперь раздел заявлен шире, и открывается он
// обычным экраном поиска. Главная кнопка Главной по-прежнему ведёт с focus=photo,
// её не трогаем. Иконка — лупа, а не камера: «Поиск» при камере читается как
// «фотографировать», а наша аудитория 35–65 разгадывать такие ребусы не должна.
//
// «Профиль» — цель nav_profile; он заменил аватарку-вход в root-layout
// (ProfileEntry), чтобы вход в кабинет был ровно один.
//
// «Идеи» — каталог рецептов, который наполняем мы сами. Пункт появляется только
// при FEATURE_IDEAS: пока раздел не наполнен, /ideas отдаёт 404, и вести туда
// человека нельзя. Цель nav_ideas новая — её надо завести в Метрике, иначе
// клики по вкладке просто не считаются.
//
// Подписи — одно короткое слово (iOS-стиль), чтобы не переносились на узких
// экранах; в контенте раздел зовётся «Найти рецепт» — это не трогаем.
// «Банкеты» и «Лента» в таб-баре не живут: за месяц ноль кликов и ноль
// публикаций. Ссылки на них остались в личном кабинете, прямые /parties,
// /party/<id> и /feed работают как раньше.
type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  goal: string;
  isActive: (p: string) => boolean;
  /**
   * Реагирует ли раздел на повторный тап по уже активной вкладке.
   *
   * Только у тех, кто это слушает. Иначе перехват превратился бы в «тап по
   * активной вкладке не делает ничего» для остальных разделов — а, например,
   * «Поиск» активен и на /search?recipeId=…, откуда тап обязан возвращать на
   * чистый /search.
   */
  reselectable?: boolean;
};

const TABS: Tab[] = [
  { href: "/", label: "Главная", icon: Home, goal: "nav_home", isActive: (p) => p === "/" },
  ...(FEATURE_IDEAS
    ? [
        {
          href: "/ideas",
          label: "Идеи",
          icon: Lightbulb,
          goal: "nav_ideas",
          isActive: (p: string) => p.startsWith("/ideas"),
          reselectable: true,
        },
      ]
    : []),
  {
    href: "/search",
    label: "Поиск",
    icon: Search,
    goal: "nav_search",
    isActive: (p) => p.startsWith("/search"),
  },
  {
    href: "/shopping",
    label: "Покупки",
    icon: ShoppingCart,
    goal: "nav_shopping",
    isActive: (p) => p.startsWith("/shopping"),
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: User,
    goal: "nav_profile",
    isActive: (p) => p.startsWith("/profile"),
  },
];

export default function TabBar() {
  const pathname = usePathname() || "/";

  // Где таб-бар скрыт: админка и полноэкранная комната банкета /party/<id>
  // (кроме /party/create). Правило лежит в lib/layoutGate.ts — ОДНО на всю
  // обвязку, чтобы копии в разных компонентах не разъезжались. Считается НА
  // КЛИЕНТЕ по usePathname: серверный root-layout не пересчитывает свой гейт
  // при soft-навигации между детьми, из-за чего бар когда-то залипал в комнате
  // банкета и перекрывал переключатель Меню/Чат.
  const hidden = isChromeHidden(pathname);

  // Класс has-tabbar на <body> (нижний отступ под фиксированный бар) сервер
  // теперь ставит БЕЗУСЛОВНО — это верное значение почти для всех экранов, и
  // именно так layout остался статическим. Снять его там, где бара нет, —
  // задача этого эффекта; он и раньше держал класс в синхроне при навигации.
  useEffect(() => {
    document.body.classList.toggle("has-tabbar", !hidden);
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      // Пять пунктов не влезают в десктопную пилюлю шапки (max-width 480px —
      // рассчитана на четыре): последняя подпись подрезается. Модификатор
      // расширяет ТОЛЬКО этот случай, поэтому вид с четырьмя вкладками (если
      // FEATURE_IDEAS снова выключат) не меняется. На мобиле бар во всю
      // ширину, и модификатор там ничего не делает.
      className={`tab-bar${TABS.length > 4 ? " tab-bar-wide" : ""}`}
      aria-label="Основная навигация"
    >
      {TABS.map((t) => {
        const active = t.isActive(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`tab-item${active ? " tab-item-active" : ""}`}
            onClick={(event) => {
              reachGoal(t.goal);
              // Повторный тап по УЖЕ активной вкладке — не навигация, а
              // «вернуться в начало раздела и обновить его», как в любом
              // приложении с таб-баром. Переход отменяем: Next на тот же
              // адрес ничего бы не перерисовал, и тап остался бы без ответа.
              // Только на корне раздела: на /ideas/<slug> вкладка подсвечена,
              // но тап по ней обязан увести в ленту (см. isTabReselect).
              if (!t.reselectable || !isTabReselect(pathname, t.href)) return;
              event.preventDefault();
              window.dispatchEvent(
                new CustomEvent<TabReselectDetail>(TAB_RESELECT_EVENT, {
                  detail: { href: t.href },
                }),
              );
            }}
            aria-current={active ? "page" : undefined}
          >
            <span className="tab-icon">
              <Icon size={24} strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
