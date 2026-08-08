import React, { useState, useRef, useEffect, useCallback } from 'react';

export const useBottomSheetDrag = (isOpen: boolean, onClose?: () => void) => {
    const [height, setHeight] = useState('45vh');
    const [isDragging, setIsDragging] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const startY = useRef<number>(0);
    const startHeight = useRef<number>(0);

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
            setHeight('45vh');
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
        startY.current = e.clientY;
        const currentVh = parseFloat(height);
        startHeight.current = (window.innerHeight * currentVh) / 100;
        
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        const delta = startY.current - e.clientY; // Up is positive
        const newH = startHeight.current + delta;
        const newVh = (newH / window.innerHeight) * 100;
        
        const clamped = Math.max(0, Math.min(100, newVh));
        setHeight(`${clamped}vh`);
    }, []);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        setIsDragging(false);
        
        const finalVh = ((window.innerHeight - e.clientY) / window.innerHeight) * 100;
        
        if (finalVh < 25) {
            if (onClose) onClose();
            setHeight('0vh');
        } else if (finalVh > 75) {
            setHeight('100vh');
        } else {
            setHeight('45vh');
        }
    }, [onClose]);

    return {
        height,
        isDragging,
        isMobile,
        dragHandlers: {
            onPointerDown: handlePointerDown,
            style: { touchAction: 'none', cursor: 'grab' } as React.CSSProperties
        }
    };
};
