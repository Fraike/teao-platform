/** Common drawings apply everywhere; scoped drawings need a current product standard. */
export function drawingAppliesToStandards(
  standardIds: readonly string[],
  currentStandards: readonly {id:string}[],
  selectedStandardId?: string,
): boolean {
  return standardIds.length===0 || currentStandards.some(standard =>
    standardIds.includes(standard.id) && (selectedStandardId===undefined || standard.id===selectedStandardId));
}
