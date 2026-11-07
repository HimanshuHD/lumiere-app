export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`} aria-hidden="true">
      <img className="brand-light" src={`${import.meta.env.BASE_URL}brand/lumiere-logo-light.svg`} alt="" />
      <img className="brand-dark" src={`${import.meta.env.BASE_URL}brand/lumiere-logo-dark.svg`} alt="" />
    </span>
  );
}
