// Иконки страницы «Премиум» — один в один из макета
// docs/premium/premium-page.dc.html. Взяты инлайном, а не из lucide-react:
// в макете они нарисованы конкретными path'ами (сковорода с объективом,
// щит с галкой, чек, календарь, стрелка возврата), и подмена на похожие
// иконки библиотеки — это уже другой макет.

type IconProps = { size?: number };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function BackIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={2.2}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** «Подбор» — фотоаппарат. */
export function PodborIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** «Без автоплатежей» — щит с галкой. */
export function ShieldIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** «Чек сразу» — чек с оторванным краем. */
export function ReceiptIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </svg>
  );
}

/** «Всё видно в профиле» — календарь. */
export function CalendarIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 3v4" />
      <path d="M15 3v4" />
    </svg>
  );
}

/** «Можно вернуть» — стрелка возврата. */
export function RefundIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}
