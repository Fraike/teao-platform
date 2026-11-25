import type { KingdeeMaterial } from '../../src/types/kingdee.ts';

export function matchEngineeringMaterials<T extends Pick<KingdeeMaterial, 'number' | 'name'> & Partial<Pick<KingdeeMaterial, 'model'>>>(materials: T[], search: string, limit: number) {
  const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLowerCase();
  const term = normalize(search);
  if (!term) return [];
  const matches = Array.from({ length: 6 }, (): T[] => []);
  for (const material of materials) {
    const code = normalize(material.number);
    const name = normalize(material.name);
    const rank = [
      code === term,
      code.startsWith(term),
      name === term,
      code.includes(term),
      name.includes(term),
      normalize(material.model).includes(term),
    ].indexOf(true);
    if (rank !== -1) matches[rank].push(material);
  }
  return matches.flat().slice(0, limit);
}
