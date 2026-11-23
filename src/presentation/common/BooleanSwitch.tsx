import { useId, type ReactNode } from 'react';

interface BooleanSwitchProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function BooleanSwitch({ label, value, onChange, description, icon, className = '' }: BooleanSwitchProps) {
  const id = useId();
  return <button type="button" role="switch" aria-checked={value} aria-labelledby={id}
    aria-describedby={description ? `${id}-description` : undefined}
    onClick={() => onChange(!value)}
    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-left text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${className}`}>
    <span className="flex min-w-0 flex-1 items-start gap-2">
      {icon && <span className="shrink-0 text-slate-500" aria-hidden="true">{icon}</span>}
      <span className="min-w-0">
        <span id={id} className="block font-semibold">{label}</span>
        {description && <span id={`${id}-description`} className="mt-1 block text-[11px] text-slate-500">{description}</span>}
      </span>
    </span>
    <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full motion-safe:transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-500'}`}>
      <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm motion-safe:transition-transform ${value ? 'translate-x-5' : ''}`} />
    </span>
  </button>;
}
