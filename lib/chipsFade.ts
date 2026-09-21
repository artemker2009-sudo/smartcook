// Затухание справа у прокручиваемой строки чипов.
//
// Затухание — подсказка «дальше есть ещё». Поэтому его НЕТ, когда подсказывать
// нечего: чипы влезли целиком (иначе крайний чип выглядит обрезанным, хотя
// прокрутки нет) или строку уже докрутили до конца.

export type ChipsScrollMetrics = {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
};

// Субпиксельная ширина округляется браузером по-разному в scrollWidth и
// clientWidth — пиксель расхождения не считаем прокруткой.
const EPSILON = 1;

export function chipsFadeVisible({ scrollWidth, clientWidth, scrollLeft }: ChipsScrollMetrics): boolean {
  if (scrollWidth <= clientWidth + EPSILON) return false;
  return scrollLeft + clientWidth < scrollWidth - EPSILON;
}
