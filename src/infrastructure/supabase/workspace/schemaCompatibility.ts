export const isMissingSchemaObjectError = (error: any, objectName: string) => {
  const message = [error?.message, error?.details, error?.hint, error?.code, (() => {
    try { return JSON.stringify(error); } catch { return ''; }
  })()].filter(Boolean).join(' ');
  return /PGRST205/i.test(message)
    || (message.includes(objectName) && /schema cache|could not find|does not exist|undefined table/i.test(message));
};
