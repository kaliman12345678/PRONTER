import type { ScriptBlock } from '../types/models';

/**
 * Returns only the blocks whose IDs are in selectedIds, preserving the original document order.
 */
export function selectBlocksForTeleprompter(
  blocks: ScriptBlock[],
  selectedIds: Set<string> | string[]
): ScriptBlock[] {
  const idSet = Array.isArray(selectedIds) ? new Set(selectedIds) : selectedIds;
  return blocks.filter((block) => idSet.has(block.id));
}
