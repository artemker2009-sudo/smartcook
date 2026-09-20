"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reachGoal } from "@/lib/metrika";
import { ALLERGIES_KEY, DISLIKES_KEY } from "@/lib/tasteProfile";
import { buildTasteMatcher, type TasteMatcher } from "@/lib/ideasTaste";
import { TAB_RESELECT_EVENT } from "@/lib/tabBarEvents";
import {
  EMPTY_FILTERS,
  MAIN_BY_PARAM,
  ORDER_KEY,
  MEAL_BY_PARAM,
  QUICK_MAX_MINUTES,
  SCROLLED_AFTER_CARD,
  SCROLLED_GOAL_KEY,
  PULL_THRESHOLD_PX,
  SEED_KEY,
  SEEN_KEY,
  applyFilters,
  filtersToQuery,
  hasAnyFilter,
  orderCards,
  newSeed,
  parseFilters,
  reuseOrder,
  shouldStartNewVisit,
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
 * Было ли это ПЕРВОЕ монтирование ленты в текущем документе.
 *
 * Модульная переменная живёт ровно столько же, сколько документ: переживает
 * мягкие переходы (возврат из рецепта) и обнуляется при перезагрузке. Именно
 * этим отличается «человек вернулся назад» от «человек открыл ленту заново» —
 * тип навигации такой разницы не знает.
 */
let mountedInThisDocument = false;

function navigationType(): string | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | (PerformanceEntry & { type?: string })
      | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

function persistVisit(seed: number, slugs: string[]): void {
  try {
    sessionStorage.setItem(SEED_KEY, JSON.stringify({ seed, at: Date.now() }));
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(slugs));
  } catch {
    // Приватный режим: порядок переживёт только текущее монтирование.
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
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

  /**
   * Перемешать ленту заново.
   *
   * Снимок открытых берётся ЗАНОВО из localStorage: только что открытые
   * рецепты должны уехать в конец — ради этого обновление и нужно.
   */
  const reshuffle = useCallback(
    (how: "pull" | "tab" | "resume", scrollTop: boolean) => {
      const seen = readJson<string[]>(localStorage, SEEN_KEY, []);
      seenRef.current = new Set(seen);
      const seed = newSeed();
      const next = orderCards(initialCards, { seed, seen });
      persistVisit(seed, next.map((c) => c.slug));
      setOrdered(next);
      reachGoal("ideas_refresh", { how });
      if (scrollTop) {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }
    },
    [initialCards],
  );

  // Порядок захода. Считается один раз и живёт в sessionStorage, но ТОЛЬКО
  // пока заход продолжается.
  //
  // Что считается новым заходом, а что продолжением — в shouldStartNewVisit.
  // Коротко: возврат назад и мягкий переход внутри приложения порядок
  // сохраняют, обычное открытие и перезагрузка — нет.
  useIsoLayoutEffect(() => {
    const seen = readJson<string[]>(localStorage, SEEN_KEY, []);
    seenRef.current = new Set(seen);

    // Фильтры из адреса — здесь же: и при первом заходе, и при возврате из
    // рецепта (возврат размонтирует ленту, эффект выполнится заново).
    setFiltersState(parseFilters(new URLSearchParams(window.location.search)));

    const freshVisit = shouldStartNewVisit({
      isFirstMountInDocument: !mountedInThisDocument,
      navigationType: navigationType(),
    });
    mountedInThisDocument = true;

    const saved = freshVisit
      ? null
      : reuseOrder(initialCards, readJson<string[] | null>(sessionStorage, ORDER_KEY, null));

    if (saved) {
      setOrdered(saved);
    } else {
      const seed = newSeed();
      const next = orderCards(initialCards, { seed, seen });
      persistVisit(seed, next.map((c) => c.slug));
      setOrdered(next);
    }

    setColumns(columnsForWidth(window.innerWidth));
    // Намеренно один раз за монтирование: список с сервера в рамках захода
    // не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Возврат из фона. Свёрнутое приложение документ не перезагружает, поэтому
  // длинная пауза — единственный признак того, что человек пришёл заново.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenMs = hiddenAt === null ? null : Date.now() - hiddenAt;
      hiddenAt = null;
      if (shouldStartNewVisit({ isFirstMountInDocument: false, hiddenMs })) {
        reshuffle("resume", true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [reshuffle]);

  // ── Оттяжка вниз ──────────────────────────────────────────────────────────
  //
  // Своими руками, без библиотек. Три условия, чтобы жест не мешал жить:
  //   • только когда лента уже в самом верху (scrollY === 0);
  //   • только если палец идёт вниз И вертикаль заметно больше горизонтали —
  //     иначе жест перехватывал бы боковую прокрутку чипов;
  //   • preventDefault на touchmove, чтобы не тянулась «резинка» браузера.
  //     Слушатель обязан быть НЕ пассивным, иначе preventDefault игнорируется.
  //
  // Нативная прокрутка страницы не трогается: пока условия не сошлись, мы
  // вообще ничего не делаем.
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullState = useRef<{ startY: number; startX: number; active: boolean } | null>(null);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      // Горизонтальная лента чипов живёт своей жизнью.
      if ((e.target as HTMLElement | null)?.closest?.(".ideas-chips-scroll")) return;
      const t = e.touches[0];
      pullState.current = { startY: t.clientY, startX: t.clientX, active: false };
    };

    const onMove = (e: TouchEvent) => {
      const st = pullState.current;
      if (!st) return;
      const t = e.touches[0];
      const dy = t.clientY - st.startY;
      const dx = Math.abs(t.clientX - st.startX);

      if (!st.active) {
        // Решаем один раз: это оттяжка или обычный жест.
        if (dy <= 0 || dy < 8) return;
        if (dx > dy) {
          pullState.current = null;
          return;
        }
        st.active = true;
      }

      if (window.scrollY > 0) {
        pullState.current = null;
        setPull(0);
        return;
      }

      e.preventDefault();
      // Затухание: палец уходит вниз быстрее, чем индикатор, — так жест
      // ощущается упругим и не улетает на пол-экрана.
      setPull(Math.min(PULL_THRESHOLD_PX * 1.6, dy * 0.5));
    };

    const onEnd = () => {
      const st = pullState.current;
      pullState.current = null;
      if (!st?.active) {
        setPull(0);
        return;
      }
      setPull((current) => {
        if (current >= PULL_THRESHOLD_PX * 0.5) {
          setRefreshing(true);
          // Перемешиваем на следующем кадре: индикатор успевает показаться, и
          // обновление не выглядит мгновенным «морганием».
          window.setTimeout(() => {
            reshuffle("pull", false);
            setRefreshing(false);
            setPull(0);
          }, prefersReducedMotion() ? 0 : 260);
          return PULL_THRESHOLD_PX * 0.5;
        }
        return 0;
      });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [reshuffle, refreshing]);

  // Гасим встроенную оттяжку-обновление Chrome и цепную прокрутку — ТОЛЬКО
  // пока открыта лента. Свойство ставится на документ (скроллится именно он, а
  // не контейнер ленты), поэтому обязательно снимаем при уходе со страницы,
  // иначе правило утекло бы на остальные экраны.
  useEffect(() => {
    document.documentElement.classList.add("ideas-no-overscroll");
    return () => document.documentElement.classList.remove("ideas-no-overscroll");
  }, []);

  // Повторный тап по активной вкладке «Идеи» — как в любом приложении с
  // таб-баром: наверх и обновить.
  useEffect(() => {
    const onReselect = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href ?? "";
      if (href.startsWith("/ideas")) reshuffle("tab", true);
    };
    window.addEventListener(TAB_RESELECT_EVENT, onReselect);
    return () => window.removeEventListener(TAB_RESELECT_EVENT, onReselect);
  }, [reshuffle]);

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
      {/* Индикатор оттяжки. Высота управляется жестом, поэтому инлайн-стиль —
          это не вкусовщина, а единственное место, где значение известно. */}
      <div className="ideas-pull" style={{ height: `${pull}px` }} aria-hidden={pull === 0}>
        <span className={`ideas-pull-dot${refreshing ? " is-spinning" : ""}`} />
      </div>

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
