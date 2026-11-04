const sanitizeInfrastructureNames = (message: string) => message
  .replace(/supabase/gi, 'serviço de dados')
  .replace(/public\.menu_publications/gi, 'serviço de publicação')
  .replace(/menu_publications/gi, 'serviço de publicação');

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return sanitizeInfrastructureNames(error.message);
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = [value.message, value.details, value.hint]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' · ');
    if (message) return sanitizeInfrastructureNames(message);
  }
  return fallback;
};
