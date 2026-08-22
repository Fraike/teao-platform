export function getResponsiveTableWidth(minWidth: number, containerWidth: number): number {
  return Math.max(minWidth, containerWidth);
}
