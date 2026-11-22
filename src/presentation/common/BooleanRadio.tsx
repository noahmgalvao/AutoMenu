import { useId, type ReactNode } from 'react';

interface BooleanRadioProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function BooleanRadio({ label, value, onChange, description, icon, className = '' }: BooleanRadioProps) {
  const id = useId();
  return <div role="radiogroup" aria-labelledby={id} aria-describedby={description ? `${id}-description` : undefined}
    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-3 text-xs text-slate-700 ${className}`}>
    <div className="flex min-w-0 flex-1 basis-32 items-start gap-2">
      {icon && <span className="shrink-0 text-slate-500" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <div id={id} className="font-semibold">{label}</div>
        {description && <p id={`${id}-description`} className="mt-1 text-[11px] text-slate-500">{description}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {([true, false] as const).map(option => (
        <label key={String(option)} className="flex min-h-6 cursor-pointer items-center gap-1.5">
          <input type="radio" name={id} value={String(option)} checked={value === option}
            onChange={() => onChange(option)} className="size-3.5 accent-indigo-600" />
          {option ? 'Sim' : 'Não'}
        </label>
      ))}
    </div>
  </div>;
}
