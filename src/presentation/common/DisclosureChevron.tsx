import { ChevronDown } from 'lucide-react';

export function DisclosureChevron({ open, size = 14, className = '' }: { open: boolean; size?: number; className?: string }) {
  return <ChevronDown size={size} aria-hidden="true"
    className={`shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-180' : ''} ${className}`} />;
}
