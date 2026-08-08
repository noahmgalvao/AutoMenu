export type FlowDirection = 'top' | 'right' | 'bottom' | 'left';

export const getEdgeControlClass = (
    direction: FlowDirection,
    lane: 'center' | 'leading' = 'center'
) => {
    if (direction === 'top') {
        return lane === 'center'
            ? '-top-3 left-1/2 -translate-x-1/2'
            : '-top-3 left-[28%] -translate-x-1/2';
    }
    if (direction === 'bottom') {
        return lane === 'center'
            ? '-bottom-3 left-1/2 -translate-x-1/2'
            : '-bottom-3 left-[28%] -translate-x-1/2';
    }
    if (direction === 'left') {
        return lane === 'center'
            ? '-left-3 top-1/2 -translate-y-1/2'
            : '-left-3 top-[28%] -translate-y-1/2';
    }
    return lane === 'center'
        ? '-right-3 top-1/2 -translate-y-1/2'
        : '-right-3 top-[28%] -translate-y-1/2';
};

export const getDirectionLabel = (direction: FlowDirection) => {
    if (direction === 'top') return 'acima';
    if (direction === 'bottom') return 'abaixo';
    if (direction === 'left') return 'à esquerda';
    return 'à direita';
};
