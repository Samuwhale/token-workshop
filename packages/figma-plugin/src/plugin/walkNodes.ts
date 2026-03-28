/**
 * Shared batched tree-walk utility for Figma plugin sandbox.
 * Yields SceneNode descendants via a stack-based DFS, periodically yielding
 * to the main thread to prevent UI freezes on large pages.
 */

/** Node types that represent visual (paintable) layers. */
export const VISUAL_TYPES = new Set([
  'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE',
  'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'LINE', 'TEXT',
]);

export interface WalkOptions {
  /** Only yield nodes whose `type` is in this set. Omit to yield every node. */
  filter?: Set<string>;
  /** How many nodes to visit before yielding to the main thread. Default 200. */
  batchSize?: number;
}

/**
 * Async generator that performs a batched depth-first walk over `roots` and
 * all their descendants.
 *
 * Usage:
 * ```ts
 * for await (const node of walkNodes(figma.currentPage.children, { filter: VISUAL_TYPES })) {
 *   // process node
 * }
 * ```
 */
export async function* walkNodes(
  roots: readonly SceneNode[],
  opts: WalkOptions = {},
): AsyncGenerator<SceneNode> {
  const { filter, batchSize = 200 } = opts;
  const stack: SceneNode[] = [...roots];
  let walkCount = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (!filter || filter.has(current.type)) {
      yield current;
    }

    if ('children' in current) {
      const container = current as ChildrenMixin & SceneNode;
      for (let i = container.children.length - 1; i >= 0; i--) {
        stack.push(container.children[i]);
      }
    }

    walkCount++;
    if (walkCount % batchSize === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
}
