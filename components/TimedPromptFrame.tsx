import React, { useEffect, useRef, useState } from 'react';

interface TimedPromptFrameProps {
  timerKey: string;
  onDismiss: () => void;
  className?: string;
  children: React.ReactNode;
}

export const TimedPromptFrame: React.FC<TimedPromptFrameProps> = ({ timerKey, onDismiss, className = '', children }) => {
  const [draining, setDraining] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setDraining(false);
    const frame = window.requestAnimationFrame(() => setDraining(true));
    const timeout = window.setTimeout(() => onDismissRef.current(), 5000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [timerKey]);

  return (
    <div
      className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border bg-white p-4 pb-5 shadow-2xl shadow-slate-900/20 ${className}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1 origin-left bg-blue-500"
        style={{
          transform: draining ? 'scaleX(0)' : 'scaleX(1)',
          transition: draining ? 'transform 5000ms linear' : 'none',
        }}
      />
    </div>
  );
};
