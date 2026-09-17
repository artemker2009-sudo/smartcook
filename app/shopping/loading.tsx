// Скелет раздела «Покупки».
//
// ЗАЧЕМ ОН НУЖЕН, ЕСЛИ СТРАНИЦА И ТАК СТАЛА СТАТИЧЕСКОЙ. loading.tsx создаёт
// Suspense-границу, и именно её содержимое Next.js отдаёт в ответ на prefetch.
// Без файла prefetch динамического маршрута возвращал 180 байт с пустыми
// сегментами (проверено на боевом) — префетчить было нечего, и тап по табу в
// любом случае ждал сеть. Со скелетом переход рисуется в том же кадре, в
// котором человек отпустил палец, а содержимое встаёт следом.
//
// Форма намеренно приблизительная: заголовок, кнопка «Новый список» и три
// строки. Точно повторять вёрстку хаба не нужно и вредно — скелет пришлось бы
// править каждый раз вместе с экраном.
export default function Loading() {
  return (
    <div className="container" role="status" aria-label="Загружаем покупки">
      <div className="sc-skel" style={{ height: "30px", width: "45%", marginBottom: "var(--space-5)" }} />

      <div
        className="sc-skel"
        style={{ height: "48px", width: "100%", borderRadius: "var(--radius-md)", marginBottom: "var(--space-5)" }}
      />

      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) 0",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div className="sc-skel" style={{ height: "40px", width: "40px", borderRadius: "var(--radius-md)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="sc-skel" style={{ height: "16px", width: `${70 - i * 12}%`, marginBottom: "var(--space-2)" }} />
            <div className="sc-skel" style={{ height: "12px", width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
