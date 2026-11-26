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

  const code = error && typeof error === 'object' ? String((error as {code?:string}).code || '') : '';
  if (code === '40001' || /conflito:|conflito na compactação/.test(normalized)) return 'Conflito: o cardápio foi alterado em outro dispositivo. Suas alterações locais foram preservadas.';
  if (code === '25006' || /read.only|somente leitura/.test(normalized)) return 'O banco está em modo somente leitura. Alterações pendentes foram preservadas neste dispositivo.';
  if (/limite de versões protegidas/.test(normalized)) return 'Limite de versões protegidas atingido. Remova uma proteção para liberar vaga.';
  if (/estado atual já está protegido/.test(normalized)) return 'O estado atual já está protegido. Edite o cardápio para salvar uma nova versão.';
  if (/histórico.*(capacidade|pausad)|reserva recusada por capacidade/.test(normalized)) return 'Histórico temporariamente pausado por capacidade. Nenhuma revisão existente foi apagada.';
  if (/backend do histórico não configurado|aguardando ativação/.test(normalized)) return 'O backend do histórico ainda precisa ser configurado e ativado.';
  if (/migração.*(pendente|andamento)/.test(normalized)) return 'Migração do histórico em andamento. Tente novamente para continuar o próximo lote.';
  if (/limite de requisição da hospedagem/.test(normalized)) return 'O documento excede o limite de requisição da hospedagem. Nenhuma gravação foi confirmada.';
  if (/serviço de histórico indisponível \(http \d{3}\)/.test(normalized)) return message;
  if (/operação expirada ou relógio/.test(normalized)) return 'Esta operação expirou ou o relógio do dispositivo está incorreto. Reabra o formulário para tentar novamente.';
  if (/cadeia ou esquema incompatível/.test(normalized)) return 'Esta revisão tem uma cadeia ou versão de esquema incompatível. A restauração foi bloqueada.';
  if (/checksum|hash do estado divergente|integridade do payload inválida/.test(normalized)) return 'A verificação de integridade desta revisão falhou. Nenhum estado foi substituído.';
  if (/recursos históricos indisponíveis/.test(normalized)) return 'Recursos históricos indisponíveis. Prévia bloqueada para preservar a fidelidade.';
  if (SAFE_MESSAGES.has(message)) return message;
  if (/invalid login credentials|invalid email or password/.test(normalized)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/.test(normalized)) return 'Confirme seu e-mail antes de entrar.';
  if (/user already registered|already been registered/.test(normalized)) return 'Este e-mail já possui uma conta.';
  if (/password.*at least|weak password/.test(normalized)) return 'Use uma senha com pelo menos 8 caracteres.';
  if (/rate limit|too many requests|muitas solicitações/.test(normalized)) return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  if (/failed to fetch|networkerror|network request failed|load failed/.test(normalized)) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';

  return fallback;
};
