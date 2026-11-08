const readErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return '';
  const value = error as Record<string, unknown>;
  return [value.message, value.details, value.hint, value.code]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ');
};

const SAFE_MESSAGES = new Set([
  'Preencha o nome do responsável e do restaurante.',
  'Nenhuma página foi selecionada.',
  'A área de recorte é muito pequena.',
  'O link público expirou ou está indisponível. Publique o cardápio novamente.',
  'Este endereço já está em uso. Escolha outro nome.',
]);

export const getErrorMessage = (error: unknown, fallback: string) => {
  const message = readErrorText(error).trim();
  const normalized = message.toLocaleLowerCase('pt-BR');

  if (SAFE_MESSAGES.has(message)) return message;
  if (/invalid login credentials|invalid email or password/.test(normalized)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/.test(normalized)) return 'Confirme seu e-mail antes de entrar.';
  if (/user already registered|already been registered/.test(normalized)) return 'Este e-mail já possui uma conta.';
  if (/password.*at least|weak password/.test(normalized)) return 'Use uma senha com pelo menos 8 caracteres.';
  if (/rate limit|too many requests/.test(normalized)) return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  if (/failed to fetch|networkerror|network request failed|load failed/.test(normalized)) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';

  return fallback;
};
