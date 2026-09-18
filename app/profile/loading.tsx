// Скелет личного кабинета. Про смысл loading.tsx — см. комментарий в
// app/shopping/loading.tsx: файл создаёт Suspense-границу, содержимое которой
// уходит в prefetch, и тап по табу «Профиль» рисуется мгновенно.
export default function Loading() {
  return (
    <div
      className="container"
      role="status"
      aria-label="Загружаем кабинет"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--space-5))" }}
    >
      <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
        <div
          className="sc-skel"
          style={{ height: "72px", width: "72px", borderRadius: "var(--radius-full)", margin: "0 auto var(--space-3)" }}
        />
        <div className="sc-skel" style={{ height: "22px", width: "50%", margin: "0 auto var(--space-2)" }} />
        <div className="sc-skel" style={{ height: "14px", width: "35%", margin: "0 auto" }} />
      </div>

      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="sc-skel"
          style={{ height: "64px", width: "100%", borderRadius: "var(--radius-md)", marginBottom: "var(--space-3)" }}
        />
      ))}
    </div>
  );
}
