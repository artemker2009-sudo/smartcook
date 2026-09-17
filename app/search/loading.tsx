// Скелет раздела «По фото». Про смысл loading.tsx — см. комментарий в
// app/shopping/loading.tsx.
//
// Здесь скелет важнее, чем на других экранах: SearchApp — самый тяжёлый
// клиентский модуль в проекте (около 1300 строк), и его чанк грузится заметно
// дольше остальных. Раньше это время человек смотрел на предыдущий экран и не
// понимал, сработал ли тап.
export default function Loading() {
  return (
    <div className="container" role="status" aria-label="Загружаем поиск">
      <div className="sc-skel" style={{ height: "30px", width: "55%", marginBottom: "var(--space-5)" }} />

      {/* Зона загрузки фото — главный элемент экрана. */}
      <div
        className="sc-skel"
        style={{ height: "180px", width: "100%", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}
      />

      <div className="sc-skel" style={{ height: "48px", width: "100%", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }} />

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        {[96, 120, 80].map((w, i) => (
          <div key={i} className="sc-skel" style={{ height: "32px", width: `${w}px`, borderRadius: "var(--radius-full)" }} />
        ))}
      </div>
    </div>
  );
}
