import type {
  IconUsageAuditFinding,
  IconUsageAuditInput,
  IconUsageAuditResultMessage,
  IconUsageAuditScope,
  IconUsageAuditSummary,
  IconSlotPreferredValuePolicy,
} from '../shared/types.js';
import type { IconSlotPropertyOwner } from './iconSlotUtils.js';
import { getErrorMessage } from '../shared/utils.js';
import { readManagedIconPluginData } from './iconPluginData.js';
import {
  findNearestMainComponent,
  getIconSlotPropertyOwner,
  ICON_SLOT_ALL_GOVERNED_ICONS_POLICY,
  ICON_SLOT_CURATED_ICONS_POLICY,
  ICON_SLOT_PREFERRED_ICON_IDS_KEY,
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
  preferredValueKeysByIconId: Map<string, Set<string>>;
  activePreferredValueKeysByIconId: Map<string, Set<string>>;
}

interface IconSlotPolicy {
  policy: IconSlotPreferredValuePolicy;
  preferredIconIds: string[];
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
  const preferredValueKeysByIconId = new Map<string, Set<string>>();
  const activePreferredValueKeysByIconId = new Map<string, Set<string>>();

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
      preferredValueKeysByIconId.set(
        icon.id,
        new Set([
          ...(preferredValueKeysByIconId.get(icon.id) ?? []),
          preferredValueKey,
        ]),
      );
      if (iconCanUseAsSlotPreference(icon)) {
        activePreferredValueKeys.add(preferredValueKey);
        activePreferredValueKeysByIconId.set(
          icon.id,
          new Set([
            ...(activePreferredValueKeysByIconId.get(icon.id) ?? []),
            preferredValueKey,
          ]),
        );
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
    preferredValueKeysByIconId,
    activePreferredValueKeysByIconId,
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
  collectComponentSlotPolicyDefinitionFindings(component, index, findings);

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

  collectComponentInstanceSlotPolicyFindings(
    instance,
    component,
    index,
    findings,
  );

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
  collectIconSlotPolicyFindings(instance, index, findings, icon);

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

function collectIconSlotPolicyFindings(
  instance: InstanceNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
  icon: IconUsageAuditInput,
): void {
  const slotPolicy = readIconSlotPolicy(instance);
  if (!slotPolicy) {
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

  collectCurrentSlotPolicyViolationFinding({
    instance,
    index,
    findings,
    icon,
    propertyOwner,
    propertyName,
    slotPolicy,
  });
  collectPreferredValueDefinitionFinding({
    sourceNode: instance,
    propertyOwner,
    propertyName,
    definition,
    policy: slotPolicy,
  }, index, findings);
}

function collectCurrentSlotPolicyViolationFinding(params: {
  instance: InstanceNode;
  index: IconUsageIndex;
  findings: IconUsageAuditFinding[];
  icon: IconUsageAuditInput;
  propertyOwner: IconSlotPropertyOwner;
  propertyName: string;
  slotPolicy: IconSlotPolicy;
}): void {
  if (params.slotPolicy.policy !== ICON_SLOT_CURATED_ICONS_POLICY) {
    return;
  }

  const allowedKeys = new Set(expectedPreferredValueKeys(params.slotPolicy, params.index));
  const key = preferredValueKeyForIcon(params.icon, params.index);
  if (!key || allowedKeys.has(key)) {
    return;
  }

  const id = findingId(
    'slot-policy-violation',
    params.instance.id,
    params.propertyName,
    params.icon.id,
  );
  if (params.findings.some((finding) => finding.id === id)) {
    return;
  }

  params.findings.push({
    id,
    type: 'slot-policy-violation',
    action: 'repair',
    severity: 'warning',
    iconId: params.icon.id,
    iconName: params.icon.name,
    iconPath: params.icon.path,
    nodeId: params.instance.id,
    nodeName: params.instance.name,
    nodeType: params.instance.type,
    pageName: pageNameForNode(params.instance),
    preferredValuePolicy: params.slotPolicy.policy,
    preferredIconIds: params.slotPolicy.preferredIconIds,
    message: `${params.instance.name} uses ${params.icon.name}, but ${stripComponentPropertyId(params.propertyName)} on ${params.propertyOwner.name} is curated to a smaller icon set.`,
  });
}

function collectComponentSlotPolicyDefinitionFindings(
  component: ComponentNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
): void {
  for (const slot of readIconSlotPolicyDefinitions(component)) {
    collectPreferredValueDefinitionFinding(slot, index, findings);
  }
}

function collectComponentInstanceSlotPolicyFindings(
  instance: InstanceNode,
  component: ComponentNode,
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
): void {
  for (const slot of readIconSlotPolicyDefinitions(component)) {
    collectPreferredValueDefinitionFinding(slot, index, findings);
    if (slot.policy.policy !== ICON_SLOT_CURATED_ICONS_POLICY) {
      continue;
    }

    const property = instance.componentProperties[slot.propertyName];
    if (property?.type !== 'INSTANCE_SWAP') {
      continue;
    }

    const selectedKey = String(property.value);
    const allowedKeys = new Set(expectedPreferredValueKeys(slot.policy, index));
    if (allowedKeys.has(selectedKey)) {
      continue;
    }

    const selectedIcon = index.iconByPreferredValueKey.get(selectedKey);
    const id = findingId(
      'slot-policy-violation',
      instance.id,
      slot.propertyName,
      selectedKey,
    );
    if (findings.some((finding) => finding.id === id)) {
      continue;
    }

    findings.push({
      id,
      type: 'slot-policy-violation',
      action: 'repair',
      severity: 'warning',
      iconId: selectedIcon?.id,
      iconName: selectedIcon?.name,
      iconPath: selectedIcon?.path,
      nodeId: instance.id,
      nodeName: instance.name,
      nodeType: instance.type,
      pageName: pageNameForNode(instance),
      preferredValuePolicy: slot.policy.policy,
      preferredIconIds: slot.policy.preferredIconIds,
      message: `${instance.name} uses an icon outside the curated ${stripComponentPropertyId(slot.propertyName)} set from ${component.name}.`,
    });
  }
}

function collectPreferredValueDefinitionFinding(
  slot: {
    sourceNode: InstanceNode;
    propertyOwner: IconSlotPropertyOwner;
    propertyName: string;
    definition: ComponentPropertyDefinitions[string];
    policy: IconSlotPolicy;
  },
  index: IconUsageIndex,
  findings: IconUsageAuditFinding[],
): void {
  const preferredKeys = readPreferredComponentKeys(slot.definition);
  const scopedKeys = policyScopedPreferredValueKeys(slot.policy, index);
  const activeKeySet = new Set(scopedKeys.active);
  const expectedKeySet = new Set(scopedKeys.active);
  const missingKeys = scopedKeys.active.filter((key) => !preferredKeys.has(key));
  const inactiveGovernedKeys = scopedKeys.inactive.filter((key) =>
    preferredKeys.has(key),
  );
  const unknownPreferredKeys = Array.from(preferredKeys).filter(
    (key) =>
      !expectedKeySet.has(key) &&
      !index.iconByPreferredValueKey.has(key),
  );
  const disallowedGovernedKeys = Array.from(preferredKeys).filter((key) => {
    const preferredIcon = index.iconByPreferredValueKey.get(key);
    return Boolean(preferredIcon) && !activeKeySet.has(key);
  });

  if (
    missingKeys.length === 0 &&
    inactiveGovernedKeys.length === 0 &&
    unknownPreferredKeys.length === 0 &&
    disallowedGovernedKeys.length === 0
  ) {
    return;
  }

  const missingIconNames = iconNamesForKeys(missingKeys, index);
  const inactiveIconNames = iconNamesForKeys(inactiveGovernedKeys, index);
  const disallowedIconNames = iconNamesForKeys(disallowedGovernedKeys, index);
  const details = [
    missingIconNames.length > 0
      ? `${formatListSummary(missingIconNames)} missing`
      : null,
    inactiveIconNames.length > 0
      ? `${formatListSummary(inactiveIconNames)} inactive`
      : null,
    disallowedIconNames.length > 0
      ? `${formatListSummary(disallowedIconNames)} outside policy`
      : null,
    unknownPreferredKeys.length > 0
      ? `${formatCount(unknownPreferredKeys.length, 'removed or unmanaged value')}`
      : null,
  ].filter(Boolean).join('; ');

  const id = findingId('stale-preferred-values', slot.propertyOwner.id, slot.propertyName);
  if (findings.some((finding) => finding.id === id)) {
    return;
  }

  findings.push({
    id,
    type: 'stale-preferred-values',
    action: 'repair',
    severity: 'info',
    nodeId: slot.sourceNode.id,
    nodeName: slot.sourceNode.name,
    nodeType: slot.sourceNode.type,
    pageName: pageNameForNode(slot.sourceNode),
    preferredValuePolicy: slot.policy.policy,
    preferredIconIds: slot.policy.preferredIconIds,
    message: `${stripComponentPropertyId(slot.propertyName)} on ${slot.propertyOwner.name} needs refreshed ${slotPolicyLabel(slot.policy)} preferred values${details ? `: ${details}` : '.'}`,
  });
}

function readIconSlotPolicyDefinitions(
  component: ComponentNode,
): Array<{
  sourceNode: InstanceNode;
  propertyOwner: IconSlotPropertyOwner;
  propertyName: string;
  definition: ComponentPropertyDefinitions[string];
  policy: IconSlotPolicy;
}> {
  const propertyOwner = getIconSlotPropertyOwner(component);
  return collectDescendantNodes(component).flatMap((node) => {
    if (node.type !== 'INSTANCE') {
      return [];
    }
    const policy = readIconSlotPolicy(node);
    const propertyName = node.componentPropertyReferences?.mainComponent;
    if (!policy || !propertyName) {
      return [];
    }
    const definition = propertyOwner.componentPropertyDefinitions[propertyName];
    if (!definition || definition.type !== 'INSTANCE_SWAP') {
      return [];
    }
    return [{
      sourceNode: node,
      propertyOwner,
      propertyName,
      definition,
      policy,
    }];
  });
}

function readIconSlotPolicy(node: SceneNode): IconSlotPolicy | null {
  const policy = node.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_SLOT_PREFERRED_VALUE_POLICY_KEY,
  );
  if (
    policy !== ICON_SLOT_ALL_GOVERNED_ICONS_POLICY &&
    policy !== ICON_SLOT_CURATED_ICONS_POLICY
  ) {
    return null;
  }

  return {
    policy,
    preferredIconIds: policy === ICON_SLOT_CURATED_ICONS_POLICY
      ? readPreferredIconIds(node)
      : [],
  };
}

function readPreferredIconIds(node: SceneNode): string[] {
  const raw = node.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_SLOT_PREFERRED_ICON_IDS_KEY,
  );
  if (!raw) {
    return [];
  }
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string')))
      : [];
  } catch {
    return [];
  }
}

function policyScopedPreferredValueKeys(
  slotPolicy: IconSlotPolicy,
  index: IconUsageIndex,
): { active: string[]; inactive: string[] } {
  if (slotPolicy.policy === ICON_SLOT_ALL_GOVERNED_ICONS_POLICY) {
    return {
      active: Array.from(index.activePreferredValueKeys),
      inactive: Array.from(index.iconByPreferredValueKey.entries())
        .filter(([, icon]) => !iconCanUseAsSlotPreference(icon))
        .map(([key]) => key),
    };
  }

  const active: string[] = [];
  const inactive: string[] = [];
  for (const iconId of slotPolicy.preferredIconIds) {
    const keys = Array.from(index.preferredValueKeysByIconId.get(iconId) ?? []);
    const icon = index.byId.get(iconId);
    if (!icon || !iconCanUseAsSlotPreference(icon)) {
      inactive.push(...keys);
      continue;
    }
    active.push(...keys);
  }

  return {
    active: Array.from(new Set(active)),
    inactive: Array.from(new Set(inactive)),
  };
}

function expectedPreferredValueKeys(
  slotPolicy: IconSlotPolicy,
  index: IconUsageIndex,
): string[] {
  return policyScopedPreferredValueKeys(slotPolicy, index).active;
}

function readPreferredComponentKeys(
  definition: ComponentPropertyDefinitions[string],
): Set<string> {
  return new Set(
    (definition.preferredValues ?? [])
      .filter((value) => value.type === 'COMPONENT')
      .map((value) => value.key),
  );
}

function preferredValueKeyForIcon(
  icon: IconUsageAuditInput,
  index: IconUsageIndex,
): string | null {
  return (
    Array.from(index.preferredValueKeysByIconId.get(icon.id) ?? [])[0] ??
    icon.componentKey ??
    icon.componentId ??
    null
  );
}

function iconNamesForKeys(keys: string[], index: IconUsageIndex): string[] {
  return keys
    .map((key) => index.iconByPreferredValueKey.get(key)?.name)
    .filter((name): name is string => Boolean(name));
}

function slotPolicyLabel(slotPolicy: IconSlotPolicy): string {
  return slotPolicy.policy === ICON_SLOT_CURATED_ICONS_POLICY
    ? 'curated icon'
    : 'governed icon';
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
    policyViolations: countFindings(findings, 'slot-policy-violation'),
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
    policyViolations: 0,
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

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
