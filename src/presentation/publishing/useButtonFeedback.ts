import { useCallback, useEffect, useRef, useState } from 'react';

export type ButtonResult = 'Baixado' | 'Copiado';

export function useButtonFeedback() {
  const [results, setResults] = useState<Partial<Record<string, ButtonResult>>>({});
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);
  const show = useCallback((action: string, result: ButtonResult) => {
    window.clearTimeout(timers.current.get(action));
    setResults(current => ({ ...current, [action]: result }));
    timers.current.set(action, window.setTimeout(() => {
      timers.current.delete(action);
      setResults(current => ({ ...current, [action]: undefined }));
    }, 2400));
  }, []);
  return { results, show };
}
