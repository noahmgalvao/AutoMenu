import { useRef, type ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick?: () => void; onSwipeUp?: () => void };

export function DesignerTapButton({ onClick, onSwipeUp, onPointerDown, ...props }: Props) {
    const touch = useRef<{ id: number; x: number; y: number } | null>(null);
    const handledTouch = useRef(false);

    return <button {...props}
        onPointerDown={event => {
            onPointerDown?.(event);
            handledTouch.current = false;
            if (event.pointerType === 'touch' && event.isPrimary) {
                touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }
        }}
        onPointerCancel={() => { touch.current = null; }}
        onPointerUp={event => {
            const start = touch.current;
            touch.current = null;
            if (!start || start.id !== event.pointerId) return;
            handledTouch.current = true;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.hypot(dx, dy) <= 12) onClick?.();
            else if (dy <= -38 && Math.abs(dy) > Math.abs(dx) * 1.4) onSwipeUp?.();
        }}
        onClick={event => {
            // A touch can activate the control before the compatibility click arrives.
            if (event.detail === 0 || !handledTouch.current) onClick?.();
            handledTouch.current = false;
        }} />;
}
