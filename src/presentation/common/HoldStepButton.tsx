import { useEffect, useRef, type ReactNode } from 'react';

export function HoldStepButton({ label, onStep, disabled, className, children, onHoldChange }: {
  label: string;
  onStep: () => boolean | void;
  disabled?: boolean;
  onHoldChange?: (holding: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const current = useRef({ onStep, disabled, onHoldChange });
  current.current = { onStep, disabled, onHoldChange };

  const stop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (held.current) {
      held.current = false;
      current.current.onHoldChange?.(false);
    }
  };
  const step = () => !current.current.disabled && current.current.onStep() !== false;
  const repeat = () => {
    if (step()) timer.current = setTimeout(repeat, 75);
  };
  useEffect(() => stop, []);

  return <button type="button" aria-label={label} title={label} disabled={disabled}
    className={`touch-none select-none disabled:opacity-40 ${className || ''}`}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      stop();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (step()) {
        held.current = true;
        current.current.onHoldChange?.(true);
        timer.current = setTimeout(repeat, 340);
      }
    }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
    onContextMenu={event => event.preventDefault()}
    onClick={event => { if (event.detail === 0) step(); }}>
    {children}
  </button>;
}
