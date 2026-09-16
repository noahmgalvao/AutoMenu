import React, { useState, useRef, useEffect, useCallback } from 'react';

export const useBottomSheetDrag = (isOpen: boolean, onClose?: () => void) => {
    const [height, setHeight] = useState('45dvh');
    const [isDragging, setIsDragging] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const startY = useRef<number>(0);
    const startHeight = useRef<number>(0);
    const expandedByUpwardGesture = useRef(false);

    // Detect Mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Reset to default when opened
    useEffect(() => {
        if (isOpen) {
            setHeight('45dvh');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isMobile || !isOpen) return;
        document.documentElement.style.setProperty('--automenu-bottom-sheet-height', height);
        return () => {
            if (document.documentElement.style.getPropertyValue('--automenu-bottom-sheet-height') === height) {
                document.documentElement.style.removeProperty('--automenu-bottom-sheet-height');
            }
        };
    }, [height, isMobile, isOpen]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isMobile) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        setIsDragging(true);
        expandedByUpwardGesture.current = false;
        startY.current = e.clientY;
        const currentVh = parseFloat(height);
        startHeight.current = (window.innerHeight * currentVh) / 100;
        
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        const delta = startY.current - e.clientY; // Up is positive
        if (delta >= 4) {
            expandedByUpwardGesture.current = true;
            setHeight('100dvh');
            return;
        }
        const newH = startHeight.current + delta;
        const newVh = (newH / window.innerHeight) * 100;
        
        const clamped = Math.max(0, Math.min(100, newVh));
        setHeight(`${clamped}dvh`);
    }, []);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        setIsDragging(false);

        if (expandedByUpwardGesture.current) {
            expandedByUpwardGesture.current = false;
            setHeight('100dvh');
            return;
        }
        
        const finalVh = ((window.innerHeight - e.clientY) / window.innerHeight) * 100;
        
        if (finalVh < 25) {
            if (onClose) onClose();
            setHeight('0dvh');
        } else if (finalVh > 75) {
            setHeight('100dvh');
        } else {
            setHeight('45dvh');
        }
    }, [onClose]);

    return {
        height,
        isDragging,
        isMobile,
        dragHandlers: {
            onPointerDown: handlePointerDown,
            style: {
                touchAction: 'none',
                cursor: 'grab',
                ...(isMobile && height === '100dvh'
                    ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }
                    : {}),
            } as React.CSSProperties
        }
    };
};
