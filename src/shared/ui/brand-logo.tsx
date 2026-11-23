import logo from '../assets/lumiere-logo.svg?raw';

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: logo }} />
  );
}
