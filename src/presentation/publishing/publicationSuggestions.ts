export const publicationSuggestionsEvent = 'automenu:publication-suggestions';

export function reviewPublicationSuggestions(): Promise<boolean> {
  return new Promise(resolve => {
    const event = new CustomEvent(publicationSuggestionsEvent, { cancelable: true, detail: { resolve } });
    if (window.dispatchEvent(event)) resolve(true);
  });
}
