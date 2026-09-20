"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reachGoal } from "@/lib/metrika";
import { ALLERGIES_KEY, DISLIKES_KEY } from "@/lib/tasteProfile";
import { buildTasteMatcher, type TasteMatcher } from "@/lib/ideasTaste";
import {
  EMPTY_FILTERS,
  MAIN_BY_PARAM,
  ORDER_KEY,
  MEAL_BY_PARAM,
  QUICK_MAX_MINUTES,
  SCROLLED_AFTER_CARD,
  SCROLLED_GOAL_KEY,
  SEED_KEY,
  SEED_TTL_MS,
  SEEN_KEY,
  applyFilters,
  filtersToQuery,
  hasAnyFilter,
  orderCards,
  parseFilters,
  reuseOrder,
  splitIntoColumns,
  type IdeaCard,
  type IdeaFilters,
} from "@/lib/ideasFeed";

// Лента «Идеи». Сервер отдал весь опубликованный каталог в каноническом
// порядке; здесь решаются три вещи: порядок захода, фильтры и раскладка.

/** На сервере useLayoutEffect ругается — там его просто нет. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MEAL_CHIPS = [
  { param: "", label: "Все" },
  ...Object.entries(MEAL_BY_PARAM).map(([param, value]) => ({
    param,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
];

const MAIN_CHIPS = Object.entries(MAIN_BY_PARAM).map(([param, value]) => ({
  param,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

// Сколько картинок грузим сразу. Первый экран — это четыре карточки в две
// колонки; остальное lazy, иначе восемьдесят картинок стартуют одновременно.
const EAGER_IMAGES = 4;

function readJson<T>(storage: Storage | null, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return (JSON.parse(raw) ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Сид захода.
 *
 * sessionStorage: мягкая навигация (возврат из рецепта) сид не трогает, полная
 * перезагрузка — трогает. Плюс срок годности: в установленном PWA вкладка
 * живёт сутками, и без него лента не перемешалась бы НИКОГДА.
 */
function readOrCreateSeed(): number {
  const fresh = () => Math.floor(Math.random() * 0xffffffff);
  if (typeof window === "undefined") return 0;
  try {
    const saved = readJson<{ seed?: number; at?: number } | null>(sessionStorage, SEED_KEY, null);
    if (saved?.seed && saved.at && Date.now() - saved.at < SEED_TTL_MS) return saved.seed;
    const seed = fresh();
    sessionStorage.setItem(SEED_KEY, JSON.stringify({ seed, at: Date.now() }));
    return seed;
  } catch {
    // Приватный режим: сид на память, лента просто перемешается ещё раз.
    return fresh();
  }
}

function columnsForWidth(width: number): number {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

/**
 * Картинка карточки.
 *
 * Место под неё зарезервировано через aspect-ratio ДО загрузки — ноль прыжков
 * вёрстки. Проявление по onLoad, но с оговоркой: если картинка уже в кэше
 * браузера, она бывает готова ДО того, как React повесит обработчик, и onLoad
 * не случится никогда. Поэтому в ref-колбэке проверяем complete — иначе
 * закэшированные карточки остались бы прозрачными навсегда.
 */
function CardImage({ card, eager }: { card: IdeaCard; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const setRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete) setLoaded(true);
  }, []);

  const portrait = card.imageAspect === "portrait";

  return (
    <img
      ref={setRef}
      src={card.imageUrl}
      alt={card.title}
      width={portrait ? 1024 : 1024}
      height={portrait ? 1536 : 1024}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      onLoad={() => setLoaded(true)}
      className={`ideas-card-img${portrait ? " ideas-card-img-portrait" : ""}${
        loaded ? " is-loaded" : ""
      }`}
    />
  );
}

export default function IdeasFeed({ initialCards }: { initialCards: IdeaCard[] }) {
  const router = useRouter();

  // ФИЛЬТРЫ ЧИТАЕМ ИЗ location, А НЕ ЧЕРЕЗ useSearchParams. Это не вкусовщина:
  // useSearchParams на статически отрендеренном маршруте заставляет Next
  // рендерить ВСЮ свою Suspense-границу на клиенте. Проверено на прод-сборке —
  // в HTML не было ни одной карточки, только заголовок. То есть SSR ленты, ради
  // которого всё и затевалось, не происходил вовсе: ни быстрого первого экрана,
  // ни картинок в разметке, ни нормального восстановления скролла.
  //
  // Теперь сервер отдаёт полный грид без фильтров, а клиент применяет фильтры
  // в layout-эффекте, то есть до отрисовки кадра.
  const [filters, setFiltersState] = useState<IdeaFilters>(EMPTY_FILTERS);

  // Порядок захода. null = ещё не считали, показываем канонический порядок
  // сервера — он корректен сам по себе, просто не перемешан.
  const [ordered, setOrdered] = useState<IdeaCard[] | null>(null);
  const [columns, setColumns] = useState(2);
  const [taste, setTaste] = useState<TasteMatcher | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Порядок считается ОДИН РАЗ за заход и живёт в sessionStorage.
  //
  // Замораживаем именно ПОРЯДОК, а не «снимок просмотренных». Возврат из
  // рецепта размонтирует ленту и монтирует заново — значит любой пересчёт
  // здесь выполнится повторно, уже с обновлённым списком открытых, и карточка
  // только что открытого рецепта уедет в конец прямо под пальцем. Поймано
  // живым прогоном: скролл вставал в чужое место.
  useIsoLayoutEffect(() => {
    const seen = readJson<string[]>(localStorage, SEEN_KEY, []);
    seenRef.current = new Set(seen);

    // Фильтры из адреса — здесь же: и при первом заходе, и при возврате из
    // рецепта (возврат размонтирует ленту, эффект выполнится заново).
    setFiltersState(parseFilters(new URLSearchParams(window.location.search)));

    const saved = reuseOrder(initialCards, readJson<string[] | null>(sessionStorage, ORDER_KEY, null));
    const next = saved ?? orderCards(initialCards, { seed: readOrCreateSeed(), seen });

    if (!saved) {
      try {
        sessionStorage.setItem(ORDER_KEY, JSON.stringify(next.map((c) => c.slug)));
      } catch {
        // Приватный режим: порядок переживёт только текущее монтирование.
      }
    }

    setOrdered(next);
    setColumns(columnsForWidth(window.innerWidth));
    // Намеренно один раз за монтирование: список с сервера в рамках захода
    // не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Профиль вкуса — в эффекте, а не в layout: он влияет только на видимость
  // чипа и на фильтр, а не на первый кадр.
  useEffect(() => {
    setTaste(
      buildTasteMatcher({
        allergies: readJson<string[]>(localStorage, ALLERGIES_KEY, []),
        dislikes: readJson<string[]>(localStorage, DISLIKES_KEY, []),
      }),
    );
  }, []);

  useEffect(() => {
    const onResize = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const visible = useMemo(
    () => applyFilters(ordered ?? initialCards, filters, taste),
    [ordered, initialCards, filters, taste],
  );

  const columnCards = useMemo(() => splitIntoColumns(visible, columns), [visible, columns]);

  const setFilters = (next: IdeaFilters, goal: string) => {
    reachGoal("ideas_filter", { filter: goal });
    setFiltersState(next);
    const query = filtersToQuery(next);
    // replace, а не push: иначе «назад» после трёх чипов отматывает фильтры по
    // одному вместо выхода из раздела. Адрес с фильтрами при этом остаётся в
    // текущей записи истории, поэтому возврат из рецепта восстанавливает и
    // фильтр, и позицию. scroll: false — чтобы смена чипа не бросала наверх.
    router.replace(query ? `/ideas?${query}` : "/ideas", { scroll: false });
  };

  const openCard = (card: IdeaCard) => {
    reachGoal("ideas_card_open", { slug: card.slug });
    // Помечаем открытым — повлияет на порядок СЛЕДУЮЩЕГО захода.
    try {
      seenRef.current.add(card.slug);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current]));
    } catch {
      // приватный режим — просто не запомним
    }
  };

  // «Листал» — главный признак возвращаемости. Считаем один раз за заход, по
  // появлению карточки после восьмой.
  const scrollMarkerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollMarkerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    try {
      if (sessionStorage.getItem(SCROLLED_GOAL_KEY)) return;
    } catch {
      /* приватный режим — цель просто уйдёт ещё раз */
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      reachGoal("ideas_scrolled");
      try {
        sessionStorage.setItem(SCROLLED_GOAL_KEY, "1");
      } catch {}
      observer.disconnect();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible.length]);

  const showFitChip = !!taste && !taste.isEmpty;
  const flatIndex = new Map(visible.map((c, i) => [c.slug, i]));

  return (
    <>
      <div className="ideas-chips ideas-chips-meal">
        {MEAL_CHIPS.map((chip) => {
          const value = chip.param ? MEAL_BY_PARAM[chip.param] : null;
          const active = filters.meal === value;
          return (
            <button
              key={chip.param || "all"}
              type="button"
              className={`ideas-chip${active ? " ideas-chip-active" : ""}`}
              aria-pressed={active}
              onClick={() => setFilters({ ...filters, meal: value }, chip.param || "all")}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="ideas-chips ideas-chips-scroll">
        {showFitChip && (
          <button
            type="button"
            className={`ideas-chip${filters.fit ? " ideas-chip-active" : ""}`}
            aria-pressed={filters.fit}
            onClick={() => setFilters({ ...filters, fit: !filters.fit }, "fit")}
          >
            Подходит мне
          </button>
        )}
        <button
          type="button"
          className={`ideas-chip${filters.quick ? " ideas-chip-active" : ""}`}
          aria-pressed={filters.quick}
          onClick={() => setFilters({ ...filters, quick: !filters.quick }, "quick")}
        >
          До {QUICK_MAX_MINUTES} минут
        </button>
        {MAIN_CHIPS.map((chip) => {
          const value = MAIN_BY_PARAM[chip.param];
          const active = filters.mainProduct === value;
          return (
            <button
              key={chip.param}
              type="button"
              className={`ideas-chip${active ? " ideas-chip-active" : ""}`}
              aria-pressed={active}
              onClick={() =>
                setFilters({ ...filters, mainProduct: active ? null : value }, chip.param)
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Мягкая формулировка: это подбор по составу, который написали мы, а не
          гарантия безопасности. Предупреждение про аллергены на экране рецепта
          остаётся в любом случае. */}
      {filters.fit && (
        <p className="ideas-note">Скрыли блюда с вашими аллергиями и нелюбимыми продуктами</p>
      )}

      {visible.length === 0 ? (
        <div className="feed-empty">
          <p className="feed-empty-text">Таких блюд пока нет</p>
          {hasAnyFilter(filters) && (
            <button
              type="button"
              className="btn-primary feed-empty-cta"
              onClick={() => setFilters(EMPTY_FILTERS, "reset")}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="ideas-grid" style={{ ["--ideas-columns" as string]: String(columns) }}>
          {columnCards.map((column, columnIndex) => (
            <div className="ideas-column" key={columnIndex}>
              {column.map((card) => {
                const index = flatIndex.get(card.slug) ?? 0;
                return (
                  <Link
                    key={card.slug}
                    href={`/ideas/${card.slug}`}
                    className="ideas-card"
                    onClick={() => openCard(card)}
                  >
                    <CardImage card={card} eager={index < EAGER_IMAGES} />
                    <div className="ideas-card-body">
                      <span className="ideas-card-title">{card.title}</span>
                      <span className="ideas-card-time">{card.cookingTimeMinutes} мин</span>
                    </div>
                    {index === SCROLLED_AFTER_CARD && (
                      <div ref={scrollMarkerRef} className="ideas-scroll-marker" aria-hidden />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
