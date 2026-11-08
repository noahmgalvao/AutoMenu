import { roundPrice } from './price';

export type PriceAdjustmentMode = 'percentage' | 'integer';

export interface PriceAdjustmentOperation {
  mode: PriceAdjustmentMode;
  signedAmount: number;
}

export interface PricePropagationRequest {
  productId: string;
  productIds?: string[];
  productName: string;
  previousPrice: number;
  nextPrice: number;
  operations: PriceAdjustmentOperation[];
}

export const applyPriceOperations = (price: number, operations: PriceAdjustmentOperation[]) => (
  operations.reduce((currentPrice, operation) => roundPrice(
    operation.mode === 'percentage'
      ? currentPrice * (1 + (operation.signedAmount / 100))
      : currentPrice + operation.signedAmount,
  ), roundPrice(price))
);

export const inferManualPriceOperation = (
  previousPrice: number,
  nextPrice: number,
): PriceAdjustmentOperation => {
  const roundedPrevious = roundPrice(previousPrice);
  const roundedNext = roundPrice(nextPrice);

  if (roundedPrevious !== 0) {
    const percentage = ((roundedNext / roundedPrevious) - 1) * 100;
    const multipleOfFive = Math.round(percentage / 5) * 5;
    const reproducedPrice = roundPrice(roundedPrevious * (1 + (multipleOfFive / 100)));
    if (
      multipleOfFive !== 0
      && reproducedPrice === roundedNext
    ) {
      return { mode: 'percentage', signedAmount: multipleOfFive };
    }
  }

  return {
    mode: 'integer',
    signedAmount: roundPrice(roundedNext - roundedPrevious),
  };
};

export const createPricePropagationRequest = ({
  productId,
  productIds,
  productName,
  previousPrice,
  nextPrice,
  operation,
}: {
  productId: string;
  productIds?: string[];
  productName: string;
  previousPrice: number;
  nextPrice: number;
  operation?: PriceAdjustmentOperation;
}): PricePropagationRequest => ({
  productId,
  productIds,
  productName,
  previousPrice: roundPrice(previousPrice),
  nextPrice: roundPrice(nextPrice),
  operations: [operation || inferManualPriceOperation(previousPrice, nextPrice)],
});

export const mergePricePropagationRequest = (
  current: PricePropagationRequest | null,
  next: PricePropagationRequest,
): PricePropagationRequest => {
  const currentIds = current?.productIds?.length ? current.productIds : current ? [current.productId] : [];
  const nextIds = next.productIds?.length ? next.productIds : [next.productId];
  const sameTargets = currentIds.length === nextIds.length
    && currentIds.every((id, index) => id === nextIds[index]);

  if (!current || !sameTargets || current.nextPrice !== next.previousPrice) return next;
  return {
    ...current,
    productName: next.productName,
    nextPrice: next.nextPrice,
    operations: [...current.operations, ...next.operations],
  };
};

export const getPricePropagationSourceIds = (request: PricePropagationRequest) => (
  new Set(request.productIds?.length ? request.productIds : [request.productId])
);
