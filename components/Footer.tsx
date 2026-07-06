import DonateButton from "@/components/DonateButton";

export default function Footer() {
  return (
    <footer className="site-footer">
      <DonateButton variant="footer" />

      <section
        style={{
          marginTop: "var(--space-3)",
          padding: "var(--space-3)",
          background: "var(--color-bg-subtle)",
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--font-size-caption)",
          lineHeight: "1.6",
          textAlign: "left",
        }}
      >
        <h2
          style={{
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
            marginBottom: "var(--space-2)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          SmartCook: Генератор рецептов по фото
        </h2>
        <p>
          SmartCook использует искусственный интеллект для распознавания
          продуктов и создания рецептов за секунды.
        </p>
      </section>
    </footer>
  );
}
