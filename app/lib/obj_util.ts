
/**
 *
 * @param {object} obj
 * @param {string} name
 */
export function deepFindObject<T = any, TParent = any>(obj: any, name: string): { parent: TParent; name: string; obj: T} {
  const parts = name.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj && obj[ parts[ i ] ];
  }

  return { parent: obj, name: parts[parts.length - 1], obj: obj && obj[parts[parts.length - 1]] };
}
