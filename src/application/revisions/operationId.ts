/** A replay retains this timestamp. Backend refuses expired keys after its bounded receipt window. */
export const revisionOperationId = () => `${Date.now()}_${crypto.randomUUID()}`;
