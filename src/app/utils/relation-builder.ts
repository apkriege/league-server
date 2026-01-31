import { ParsedQs } from 'qs';

export const relationBuilder = (query: ParsedQs | undefined, key: string) => {
  if (!query) {
    return undefined;
  }

  const withQuery = query.with;
  const x = typeof withQuery === 'string' ? [withQuery] : withQuery;

  return Array.isArray(x) && x.includes(key) ? true : false;
};
