/** Original code-native character. Purely visual; never implies agent execution. */
export function FlowOrb({ variant = "expanded", decorative = false }: { variant?: "compact" | "expanded"; decorative?: boolean }) {
  return <svg className="flow-orb" data-variant={variant} width={variant === "compact" ? 64 : 256} height={variant === "compact" ? 64 : 256}
    viewBox="0 0 256 256" fill="none" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : "Flow Orb, mascote do go.agent"}>
    <ellipse className="orb-shadow" cx="128" cy="226" rx="65" ry="8" />
    <circle className="orb-body" cx="128" cy="132" r="83" />
    <path className="orb-shade" d="M172 60C232 112 202 220 110 216C174 204 206 131 172 60Z" />
    <ellipse className="orb-face" cx="130" cy="137" rx="64" ry="52" />
    <path className="orb-hood orb-ribbon" d="M46 170C7 119 27 46 90 31C148 16 199 54 211 111C172 60 117 51 81 88C53 118 63 153 46 170Z" />
    <path className="orb-highlight" d="M42 100C48 58 86 35 121 39" strokeWidth="5" strokeLinecap="round" />
    <path className="orb-pink" d="M51 176C110 221 189 190 208 144C210 203 117 240 51 190Z" />
    <path className="orb-eye orb-lid" d="M92 135Q101 120 111 133M146 133Q155 119 165 131" />
    <path className="orb-expression" d="M119 155Q130 166 143 153" strokeWidth="4" strokeLinecap="round" />
    {variant === "expanded" && <g strokeWidth="6" strokeLinecap="round"><path className="orb-pink-stroke" d="M202 47L207 32M219 61L233 51M223 80L240 82" /></g>}
  </svg>;
}
