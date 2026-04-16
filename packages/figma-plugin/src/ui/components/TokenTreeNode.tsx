/**
 * TokenTreeNode — thin dispatcher that delegates to TokenGroupNode or TokenLeafNode.
 *
 * All rendering logic lives in:
 *   - token-tree/TokenGroupNode.tsx  (group/folder rows)
 *   - token-tree/TokenLeafNode.tsx   (leaf token rows)
 *   - token-tree/MultiModeCell.tsx   (per-theme-option inline cells)
 *   - token-tree/tokenTreeNodeUtils.tsx (shared helpers)
 */
import type { TokenTreeNodeProps } from "./tokenListTypes";
import { TokenGroupNode } from "./token-tree/TokenGroupNode";
import { TokenLeafNode } from "./token-tree/TokenLeafNode";

export function TokenTreeNode(props: TokenTreeNodeProps) {
  if (props.node.isGroup) return <TokenGroupNode {...props} />;
  return <TokenLeafNode {...props} />;
}
