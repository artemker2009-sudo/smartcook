// Скелет рецепта на время серверного чтения (задача T). Показывается мгновенно
// вместо пустого экрана/глобального лоадера приложения.
export default function Loading() {
  return (
    <div className="container">
      <div className="card" style={{ marginTop: "var(--space-5)" }}>
        <div className="sc-skel" style={{ height: "28px", width: "70%", marginBottom: "var(--space-3)" }} />
        <div className="sc-skel" style={{ height: "16px", width: "90%", marginBottom: "var(--space-2)" }} />
        <div className="sc-skel" style={{ height: "16px", width: "60%", marginBottom: "var(--space-4)" }} />
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          <div className="sc-skel" style={{ height: "32px", width: "96px", borderRadius: "var(--radius-full)" }} />
          <div className="sc-skel" style={{ height: "32px", width: "96px", borderRadius: "var(--radius-full)" }} />
        </div>
        <div className="sc-skel" style={{ height: "120px", width: "100%", marginBottom: "var(--space-4)", borderRadius: "var(--radius-md)" }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div className="sc-skel" style={{ height: "32px", width: "32px", borderRadius: "var(--radius-full)", flexShrink: 0 }} />
            <div className="sc-skel" style={{ height: "16px", flex: 1, marginTop: "var(--space-1)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
