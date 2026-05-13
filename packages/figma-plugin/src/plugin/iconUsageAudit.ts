import type {
  IconUsageAuditFinding,
  IconUsageAuditInput,
  IconUsageAuditResultMessage,
  IconUsageAuditScope,
  IconUsageAuditSummary,
} from '../shared/types.js';
import { getErrorMessage } from '../shared/utils.js';
import { readManagedIconPluginData } from './iconPluginData.js';
import {
  findNearestMainComponent,
  getIconSlotPropertyOwner,
  ICON_SLOT_ALL_GOVERNED_ICONS_POLICY,
  ICON_SLOT_PREFERRED_VALUE_POLICY_KEY,
  isIconSlotCandidateNode,
  looksLikeIconLayerName,
} from './iconSlotUtils.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';

type AuditNode = SceneNode | ComponentNode;

interface IconUsageIndex {
  byId: Map<string, IconUsageAuditInput>;
  byComponentId: Map<string, IconUsageAuditInput>;
  byComponentKey: Map<string, IconUsageAuditInput>;
  componentIds: Map<string, string[]>;
  iconByPreferredValueKey: Map<string, IconUsageAuditInput>;
  activePreferredValueKeys: Set<string>;
}

export async function scanIconUsage(options: {
  scope: IconUsageAuditScope;
  icons: IconUsageAuditInput[];
  correlationId?: string;
}): Promise<void> {
  try {
    const index = await createIconUsageIndex(options.icons);
    const nodes = collectAuditNodes(options.scope);
    const findings: IconUsageAuditFinding[] = [];
    const usageCounts = new Map<string, number>();
    const componentOccurrences = new Map<string, ComponentNode[]>();

    await collectRegistryLinkFindings(index, findings, componentOccurrences);

    for (const node of nodes) {
      if (node.type === 'COMPONENT') {
        collectComponentFindings(node, index, findings, componentOccurrences);
        continue;
      }

      if (node.type === 'INSTANCE') {
        await collectInstanceFindings(node, index, findings, usageCounts);
        continue;
      }

      collectRawLayerFinding(node, findings);
    }

    collectDuplicateComponentFindings(index, findings, componentOccurrences);
    collectUnusedIconFindings(options.scope, index, findings, usageCounts);

    const summary = summarizeIconUsageFindings(findings, usageCounts);
    figma.ui.postMessage({
      type: 'icon-usage-audit-result',
      scope: options.scope,
      findings,
      summary,
      scannedNodes: nodes.length,
      correlationId: options.correlationId,
    } satisfies IconUsageAuditResultMessage);
  } catch (error) {
    figma.ui.postMessage({
      type: 'icon-usage-audit-result',
      scope: options.scope,
      findings: [],
      summary: emptyIconUsageSummary(),
      scannedNodes: 0,
      error: getErrorMessage(error, 'Failed to audit icon usage.'),
      correlationId: options.correlationId,
    } satisfies IconUsageAuditResultMessage);
  }
}

async function createIconUsageIndex(icons: IconUsageAuditInput[]): Promise<IconUsageIndex> {
  const byId = new Map<string, IconUsageAuditInput>();
  const byComponentId = new Map<string, IconUsageAuditInput>();
  const byComponentKey = new Map<string, IconUsageAuditInput>();
  const componentIds = new Map<string, string[]>();
  const iconByPreferredValueKey = new Map<string, IconUsageAuditInput>();
  const activePreferredValueKeys = new Set<string>();

  for (const icon of icons) {
    byId.set(icon.id, icon);
    if (icon.componentId) {
      byComponentId.set(icon.componentId, icon);
      const existing = componentIds.get(icon.componentId) ?? [];
      existing.push(icon.id);
      componentIds.set(icon.componentId, existing);
    }
    if (icon.componentKey) {
      byComponentKey.set(icon.componentKey, icon);
    }

    const preferredValueKey = await resolveIconPreferredValueKey(icon);
    if (preferredValueKey) {
      iconByPreferredValueKey.set(preferredValueKey, icon);
      if (iconCanUseAsSlotPreference(icon)) {
        activePreferredValueKeys.add(preferredValueKey);
      }
    }
  }

  return {
    byId,
    byComponentId,
    byComponentKey,
    componentIds,
    iconByPreferredValueKey,
    activePreferredValueKeys,
  };
}

function collectAuditNodes(scope: IconUsageAuditScope): AuditNode[] {
  if (scope === 'selection') {
    return figma.currentPage.selection.flatMap((node) => [
      node,
      ...collectDescendantNodes(node),
    ]);
  }

  if (scope === 'page') {
    return collectPageAuditNodes(figma.currentPage);
  }

  return figma.root.children.flatMap((page) => collectPageAuditNodes(page));
}

function collectPageAuditNodes(page: PageNode): AuditNode[] {
  return page.children.flatMap((node) => [
    node,
    ...collectDescendantNodes(node),
  ]);
}

function collectDescendantNodes(node: SceneNode): SceneNode[] {
  if (!('children' in node)) {
    return [];
  }

  return node.children.flatMap((child) => [
    child,
    ...collectDescendantNodes(child),
  ]);
}

async function collectRegistryLinkFindings(
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  componentOccurrences: Map<string, ComponentNode[]>,
): Promise<void> {
  for (const icon of index.byId.values()) {
    if (!icon.componentId) {
      continue;
    }

    const node = await figma.getNodeByIdAsync(icon.componentId);
    if (node?.type !== 'COMPONENT') {
      findings.push({
        id: findingId('missing-component', icon.id, icon.componentId),
        type: 'missing-component',
        action: 'publish',
        severity: 'error',
        iconId: icon.id,
        iconName: icon.name,
        iconPath: icon.path,
        message: `${icon.name} is linked to a Figma component that is missing from this file.`,
      });
      continue;
    }

    appendComponentOccurrence(componentOccurrences, icon.id, node);
  }
}

function collectComponentFindings(
  component: ComponentNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  componentOccurrences: Map<string, ComponentNode[]>,
): void {
  const data = readManagedIconPluginData(component);
  if (!data) {
    if (looksLikeIconLayerName(component.name)) {
      findings.push({
        id: findingId('unmanaged-icon-component', component.id),
        type: 'unmanaged-icon-component',
        action: 'replace',
        severity: 'warning',
        nodeId: component.id,
        nodeName: component.name,
        nodeType: component.type,
        pageName: pageNameForNode(component),
        message: `${component.name} looks like an icon component but is not managed by Token Workshop.`,
      });
    }
    return;
  }

  const icon = index.byId.get(data.id);
  if (!icon) {
    findings.push({
      id: findingId('unknown-managed-component', component.id, data.id),
      type: 'unknown-managed-component',
      action: 'review',
      severity: 'warning',
      nodeId: component.id,
      nodeName: component.name,
      nodeType: component.type,
      pageName: pageNameForNode(component),
      message: `${component.name} has Token Workshop icon metadata but no matching registry icon.`,
    });
    return;
  }

  appendComponentOccurrence(componentOccurrences, icon.id, component);

  if (component.name !== icon.componentName) {
    findings.push({
      id: findingId('renamed-component', component.id, icon.id),
      type: 'renamed-component',
      action: 'sync',
      severity: 'warning',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      nodeId: component.id,
      nodeName: component.name,
      nodeType: component.type,
      pageName: pageNameForNode(component),
      message: `${component.name} should be named ${icon.componentName}.`,
    });
  }

  if (data.hash && data.hash !== icon.svgHash) {
    findings.push({
      id: findingId('stale-component', component.id, icon.id),
      type: 'stale-component',
      action: 'sync',
      severity: 'warning',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      nodeId: component.id,
      nodeName: component.name,
      nodeType: component.type,
      pageName: pageNameForNode(component),
      message: `${icon.name} has source changes that are not synced to its Figma component.`,
    });
  }
}

async function collectInstanceFindings(
  instance: InstanceNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  usageCounts: Map<string, number>,
): Promise<void> {
  const component = await instance.getMainComponentAsync();
  if (!component) {
    return;
  }

  const data = readManagedIconPluginData(component);
  const icon =
    (data?.id ? index.byId.get(data.id) : undefined) ??
    index.byComponentId.get(component.id) ??
    (component.key ? index.byComponentKey.get(component.key) : undefined);

  if (!icon) {
    if (looksLikeIconLayerName(component.name) || looksLikeIconLayerName(instance.name)) {
      findings.push({
        id: findingId('unmanaged-icon-component', instance.id, component.id),
        type: 'unmanaged-icon-component',
        action: 'replace',
        severity: 'warning',
        nodeId: instance.id,
        nodeName: instance.name,
        nodeType: instance.type,
        pageName: pageNameForNode(instance),
        message: `${instance.name} uses an icon-like component that is not managed by Token Workshop.`,
      });
    }
    return;
  }

  usageCounts.set(icon.id, (usageCounts.get(icon.id) ?? 0) + 1);

  if (icon.status === 'deprecated') {
    findings.push({
      id: findingId('deprecated-usage', instance.id, icon.id),
      type: 'deprecated-usage',
      action: 'deprecate',
      severity: 'warning',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      nodeId: instance.id,
      nodeName: instance.name,
      nodeType: instance.type,
      pageName: pageNameForNode(instance),
      message: `${instance.name} uses deprecated icon ${icon.name}.`,
    });
  }
  if (icon.status === 'blocked' || icon.qualityState === 'blocked') {
    findings.push({
      id: findingId('blocked-icon-usage', instance.id, icon.id),
      type: 'blocked-icon-usage',
      action: 'replace',
      severity: 'error',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      nodeId: instance.id,
      nodeName: instance.name,
      nodeType: instance.type,
      pageName: pageNameForNode(instance),
      message: `${instance.name} uses blocked icon ${icon.name}.`,
    });
  }

  collectManagedIconFrameFinding(instance, findings, icon);
  collectManagedIconColorFinding(instance, findings, icon);
  collectUnpromotedIconSlotFinding(instance, findings, icon);
  collectStalePreferredValuesFinding(instance, index, findings, icon);

  if (data?.hash && data.hash !== icon.svgHash) {
    findings.push({
      id: findingId('stale-component', instance.id, icon.id),
      type: 'stale-component',
      action: 'sync',
      severity: 'warning',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      nodeId: instance.id,
      nodeName: instance.name,
      nodeType: instance.type,
      pageName: pageNameForNode(instance),
      message: `${instance.name} uses a stale published version of ${icon.name}.`,
    });
  }
}

function collectRawLayerFinding(
  node: SceneNode,
  findings: IconUsageAuditFinding[],
): void {
  if (!isRawIconCandidate(node)) {
    return;
  }

  const ownerComponent = findNearestMainComponent(node);
  if (
    ownerComponent &&
    looksLikeIconLayerName(node.name) &&
    !node.componentPropertyReferences?.mainComponent
  ) {
    findings.push({
      id: findingId('unpromoted-icon-slot', node.id),
      type: 'unpromoted-icon-slot',
      action: 'repair',
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      pageName: pageNameForNode(node),
      message: `${node.name} looks like an icon slot in ${ownerComponent.name} but is not exposed as an instance-swap property.`,
    });
    return;
  }

  findings.push({
    id: findingId('raw-icon-layer', node.id),
    type: 'raw-icon-layer',
    action: 'replace',
    severity: 'info',
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    pageName: pageNameForNode(node),
    message: `${node.name} looks like raw icon artwork. Replace it with a managed icon if it belongs to the system library.`,
  });
}

function collectManagedIconFrameFinding(
  instance: InstanceNode,
  findings: IconUsageAuditFinding[],
  icon: IconUsageAuditInput,
): void {
  const targetSize = icon.targetSize;
  if (!Number.isFinite(targetSize) || targetSize <= 0) {
    return;
  }
  if (
    numbersAlmostEqual(instance.width, targetSize) &&
    numbersAlmostEqual(instance.height, targetSize)
  ) {
    return;
  }

  findings.push({
    id: findingId('icon-frame-mismatch', instance.id, icon.id),
    type: 'icon-frame-mismatch',
    action: 'repair',
    severity: 'warning',
    iconId: icon.id,
    iconName: icon.name,
    iconPath: icon.path,
    nodeId: instance.id,
    nodeName: instance.name,
    nodeType: instance.type,
    pageName: pageNameForNode(instance),
    message: `${instance.name} uses ${icon.name} at ${formatDimension(instance.width)}x${formatDimension(instance.height)} instead of the ${formatDimension(targetSize)}x${formatDimension(targetSize)} icon frame.`,
  });
}

function collectManagedIconColorFinding(
  instance: InstanceNode,
  findings: IconUsageAuditFinding[],
  icon: IconUsageAuditInput,
): void {
  if (
    icon.colorBehavior !== 'inheritable' &&
    icon.colorBehavior !== 'hardcoded-monotone'
  ) {
    return;
  }
  if (hasTokenAlignedIconPaint(instance)) {
    return;
  }
  const ownerComponent = findNearestMainComponent(instance);
  if (!ownerComponent) {
    return;
  }

  findings.push({
    id: findingId('hardcoded-icon-color', instance.id, icon.id),
    type: 'hardcoded-icon-color',
    action: 'repair',
    severity: 'info',
    iconId: icon.id,
    iconName: icon.name,
    iconPath: icon.path,
    nodeId: instance.id,
    nodeName: instance.name,
    nodeType: instance.type,
    pageName: pageNameForNode(instance),
    message: `${instance.name} uses monotone icon ${icon.name} inside ${ownerComponent.name} without a token or variable color binding.`,
  });
}

function collectUnpromotedIconSlotFinding(
  instance: InstanceNode,
  findings: IconUsageAuditFinding[],
  icon: IconUsageAuditInput,
): void {
  const ownerComponent = findNearestMainComponent(instance);
  if (!ownerComponent || instance.componentPropertyReferences?.mainComponent) {
    return;
  }

  findings.push({
    id: findingId('unpromoted-icon-slot', instance.id, icon.id),
    type: 'unpromoted-icon-slot',
    action: 'repair',
    severity: 'info',
    iconId: icon.id,
    iconName: icon.name,
    iconPath: icon.path,
    nodeId: instance.id,
    nodeName: instance.name,
    nodeType: instance.type,
    pageName: pageNameForNode(instance),
    message: `${instance.name} uses managed icon ${icon.name} inside ${ownerComponent.name} but is not exposed as an instance-swap property.`,
  });
}

function collectStalePreferredValuesFinding(
  instance: InstanceNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  icon: IconUsageAuditInput,
): void {
  if (
    instance.getSharedPluginData(
      PLUGIN_DATA_NAMESPACE,
      ICON_SLOT_PREFERRED_VALUE_POLICY_KEY,
    ) !== ICON_SLOT_ALL_GOVERNED_ICONS_POLICY
  ) {
    return;
  }

  const propertyName = instance.componentPropertyReferences?.mainComponent;
  if (!propertyName) {
    return;
  }

  const ownerComponent = findNearestMainComponent(instance);
  if (!ownerComponent) {
    return;
  }

  const propertyOwner = getIconSlotPropertyOwner(ownerComponent);
  const definition = propertyOwner.componentPropertyDefinitions[propertyName];
  if (!definition || definition.type !== 'INSTANCE_SWAP') {
    return;
  }

  const preferredKeys = new Set(
    (definition.preferredValues ?? [])
      .filter((value) => value.type === 'COMPONENT')
      .map((value) => value.key),
  );
  const missingKeys = Array.from(index.activePreferredValueKeys).filter(
    (key) => !preferredKeys.has(key),
  );
  const inactiveGovernedKeys = Array.from(preferredKeys).filter((key) => {
    const preferredIcon = index.iconByPreferredValueKey.get(key);
    return preferredIcon ? !iconCanUseAsSlotPreference(preferredIcon) : false;
  });

  if (missingKeys.length === 0 && inactiveGovernedKeys.length === 0) {
    return;
  }

  const missingIconNames = missingKeys
    .map((key) => index.iconByPreferredValueKey.get(key)?.name)
    .filter((name): name is string => Boolean(name));
  const inactiveIconNames = inactiveGovernedKeys
    .map((key) => index.iconByPreferredValueKey.get(key)?.name)
    .filter((name): name is string => Boolean(name));
  const details = [
    missingIconNames.length > 0
      ? `${formatListSummary(missingIconNames)} missing`
      : null,
    inactiveIconNames.length > 0
      ? `${formatListSummary(inactiveIconNames)} inactive`
      : null,
  ].filter(Boolean).join('; ');

  const id = findingId('stale-preferred-values', propertyOwner.id, propertyName);
  if (findings.some((finding) => finding.id === id)) {
    return;
  }

  findings.push({
    id,
    type: 'stale-preferred-values',
    action: 'repair',
    severity: 'info',
    iconId: icon.id,
    iconName: icon.name,
    iconPath: icon.path,
    nodeId: instance.id,
    nodeName: instance.name,
    nodeType: instance.type,
    pageName: pageNameForNode(instance),
    message: `${stripComponentPropertyId(propertyName)} on ${propertyOwner.name} needs refreshed governed icon preferred values${details ? `: ${details}` : '.'}`,
  });
}

function collectDuplicateComponentFindings(
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  componentOccurrences: Map<string, ComponentNode[]>,
): void {
  for (const [iconId, components] of componentOccurrences.entries()) {
    const uniqueComponents = Array.from(
      new Map(components.map((component) => [component.id, component])).values(),
    );
    if (uniqueComponents.length < 2) {
      continue;
    }

    const icon = index.byId.get(iconId);
    findings.push({
      id: findingId('duplicate-component', iconId),
      type: 'duplicate-component',
      action: 'repair',
      severity: 'warning',
      iconId,
      iconName: icon?.name,
      iconPath: icon?.path,
      message: `${icon?.name ?? iconId} has ${uniqueComponents.length} managed Figma components in this file.`,
    });
  }
}

function collectUnusedIconFindings(
  scope: IconUsageAuditScope,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  usageCounts: Map<string, number>,
): void {
  if (scope !== 'file') {
    return;
  }

  for (const icon of index.byId.values()) {
    if (!shouldReportUnusedIcon(icon) || usageCounts.has(icon.id)) {
      continue;
    }

    findings.push({
      id: findingId('unused-icon', icon.id),
      type: 'unused-icon',
      action: 'deprecate',
      severity: 'info',
      iconId: icon.id,
      iconName: icon.name,
      iconPath: icon.path,
      message: `${icon.name} has no managed instances in this file. Review before deprecating or removing it from the active icon library.`,
    });
  }
}

function shouldReportUnusedIcon(icon: IconUsageAuditInput): boolean {
  return (
    icon.status === 'published' &&
    icon.qualityState !== 'blocked' &&
    Boolean(icon.componentId || icon.componentKey)
  );
}

function summarizeIconUsageFindings(
  findings: IconUsageAuditFinding[],
  usageCounts: Map<string, number>,
): IconUsageAuditSummary {
  return {
    managedInstances: Array.from(usageCounts.values()).reduce(
      (total, count) => total + count,
      0,
    ),
    unmanagedComponents: countFindings(findings, 'unmanaged-icon-component'),
    unpromotedIconSlots: countFindings(findings, 'unpromoted-icon-slot'),
    rawIconLayers: countFindings(findings, 'raw-icon-layer'),
    frameIssues: countFindings(findings, 'icon-frame-mismatch'),
    colorIssues: countFindings(findings, 'hardcoded-icon-color'),
    preferredValueIssues: countFindings(findings, 'stale-preferred-values'),
    deprecatedUsages: countFindings(findings, 'deprecated-usage'),
    blockedUsages: countFindings(findings, 'blocked-icon-usage'),
    unusedIcons: countFindings(findings, 'unused-icon'),
    staleComponents: countFindings(findings, 'stale-component'),
    missingComponents: countFindings(findings, 'missing-component'),
  };
}

function emptyIconUsageSummary(): IconUsageAuditSummary {
  return {
    managedInstances: 0,
    unmanagedComponents: 0,
    unpromotedIconSlots: 0,
    rawIconLayers: 0,
    frameIssues: 0,
    colorIssues: 0,
    preferredValueIssues: 0,
    deprecatedUsages: 0,
    blockedUsages: 0,
    unusedIcons: 0,
    staleComponents: 0,
    missingComponents: 0,
  };
}

function countFindings(
  findings: IconUsageAuditFinding[],
  type: IconUsageAuditFinding['type'],
): number {
  return findings.filter((finding) => finding.type === type).length;
}

function appendComponentOccurrence(
  occurrences: Map<string, ComponentNode[]>,
  iconId: string,
  component: ComponentNode,
): void {
  const existing = occurrences.get(iconId) ?? [];
  existing.push(component);
  occurrences.set(iconId, existing);
}

function isRawIconCandidate(node: SceneNode): boolean {
  return isIconSlotCandidateNode(node);
}

async function resolveIconPreferredValueKey(
  icon: IconUsageAuditInput,
): Promise<string | null> {
  if (icon.componentKey) {
    return icon.componentKey;
  }
  if (!icon.componentId) {
    return null;
  }

  const node = await figma.getNodeByIdAsync(icon.componentId);
  return node?.type === 'COMPONENT' ? node.key : null;
}

function iconCanUseAsSlotPreference(icon: IconUsageAuditInput): boolean {
  return (
    icon.status !== 'deprecated' &&
    icon.status !== 'blocked' &&
    icon.qualityState !== 'blocked' &&
    Boolean(icon.componentId || icon.componentKey)
  );
}

function hasTokenAlignedIconPaint(node: SceneNode): boolean {
  if (hasStoredTokenColorBinding(node) || hasBoundVariableColorPaint(node)) {
    return true;
  }
  if (!('children' in node)) {
    return false;
  }
  return node.children.some((child) => hasTokenAlignedIconPaint(child));
}

function hasStoredTokenColorBinding(node: SceneNode): boolean {
  return Boolean(
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, 'fill') ||
      node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, 'stroke'),
  );
}

function hasBoundVariableColorPaint(node: SceneNode): boolean {
  return (
    hasBoundVariableColorInPaints(readPaints(node, 'fills')) ||
    hasBoundVariableColorInPaints(readPaints(node, 'strokes'))
  );
}

function readPaints(
  node: SceneNode,
  property: 'fills' | 'strokes',
): readonly Paint[] {
  if (!(property in node)) {
    return [];
  }
  const paints = (node as Partial<GeometryMixin>)[property];
  return Array.isArray(paints) ? paints : [];
}

function hasBoundVariableColorInPaints(paints: readonly Paint[]): boolean {
  return paints.some((paint) => {
    if (paint.visible === false) {
      return false;
    }
    const boundVariables = (paint as { boundVariables?: { color?: { id?: string } } }).boundVariables;
    return Boolean(boundVariables?.color?.id);
  });
}

function pageNameForNode(node: BaseNode): string | undefined {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') {
      return current.name;
    }
    current = current.parent;
  }
  return undefined;
}

function findingId(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(':');
}

function numbersAlmostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

function formatDimension(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function stripComponentPropertyId(propertyName: string): string {
  return propertyName.replace(/#[^#]*$/, '');
}

function formatListSummary(values: string[]): string {
  const uniqueValues = Array.from(new Set(values));
  if (uniqueValues.length <= 3) {
    return uniqueValues.join(', ');
  }
  return `${uniqueValues.slice(0, 3).join(', ')} and ${uniqueValues.length - 3} more`;
}
