/* Logo Casa Áurea (marca + nome), a mesma do site. */
export function BrandMark({ size = 22, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="adm-brandmark">
      <svg viewBox="-3 -3 240 311" width={Math.round(size * 0.77)} height={size} fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden="true">
        <rect x="0" y="0" width="234" height="305" vectorEffect="non-scaling-stroke" />
        <path d="M116 305V129H234" vectorEffect="non-scaling-stroke" />
        <path d="M0 252C4 184 52 129 130 129C190 129 232 170 232 214C232 262 198 290 162 290C134 290 116 272 116 250C116 229 131 217 146 217C161 217 171 229 169 242C167 254 155 257 147 250" vectorEffect="non-scaling-stroke" />
      </svg>
      {label && <span className="adm-brandname">CASA ÁUREA</span>}
    </span>
  );
}
