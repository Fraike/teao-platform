export function splitGearSpecifications(value: string): string[] {
  return value.split(/\r?\n|[\t \u3000]+(?=[A-Z][A-Z0-9]*-)/).map(item => item.trim()).filter(Boolean);
}
