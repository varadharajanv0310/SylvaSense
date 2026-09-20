export default function Brand({ light = false }: { light?: boolean }) {
  return <a className={`brand ${light ? "brand-light" : ""}`} href="/concepts" aria-label="SylvaSense concept selector"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25V8l11 7 11-7v17L16 18Z"/><path d="M5 8l11 7V3M16 18v11"/></svg><span>SylvaSense<span className="brand-dot">®</span></span></a>;
}
