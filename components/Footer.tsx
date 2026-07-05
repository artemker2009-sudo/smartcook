import DonateButton from "@/components/DonateButton";

export default function Footer() {
  return (
    <footer className="site-footer">
      <DonateButton variant="footer" />

      <section
        style={{
          marginTop: "20px",
          padding: "20px",
          background: "#f9fafb",
          borderRadius: "16px",
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: "1.6",
          textAlign: "left",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            color: "#1f2937",
            marginBottom: "10px",
            fontWeight: "700",
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
