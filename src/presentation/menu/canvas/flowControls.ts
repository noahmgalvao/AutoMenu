export type FlowDirection = 'top' | 'right' | 'bottom' | 'left';

export const getDirectionLabel = (direction: FlowDirection) => {
    if (direction === 'top') return 'acima';
    if (direction === 'bottom') return 'abaixo';
    if (direction === 'left') return 'à esquerda';
    return 'à direita';
};
