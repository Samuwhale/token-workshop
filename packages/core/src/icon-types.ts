export type IconStatus = 'draft' | 'published' | 'deprecated' | 'blocked';

export type IconColorBehavior =
  | 'inheritable'
  | 'hardcoded-monotone'
  | 'multicolor'
  | 'unknown';

export type IconSource =
  | {
      kind: 'local-svg';
      path: string;
    }
  | {
      kind: 'pasted-svg';
    }
  | {
      kind: 'figma-selection';
      nodeId: string;
      fileKey?: string;
      pageId?: string;
      pageName?: string;
    }
  | {
      kind: 'generated';
      description?: string;
    };

export interface IconSvgMetadata {
  viewBox: string;
  viewBoxMinX: number;
  viewBoxMinY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  hash: string;
  contentHash: string;
  color: IconColorMetadata;
  features: IconSvgFeatureMetadata;
  content?: string;
}

export interface IconColorMetadata {
  behavior: IconColorBehavior;
  values: string[];
  usesCurrentColor: boolean;
  hasInlineStyles: boolean;
  hasPaintServers: boolean;
  hasOpacity: boolean;
}

export interface IconSvgFeatureMetadata {
  hasStyleBlocks: boolean;
  hasStrokes: boolean;
  hasNonScalingStrokes: boolean;
  hasMasks: boolean;
  hasClipPaths: boolean;
  hasFilters: boolean;
  hasRasterImages: boolean;
}

export type IconQualityState = 'ready' | 'review' | 'blocked';

export type IconQualityIssueSeverity = 'warning' | 'error';

export type IconQualityIssueKind =
  | 'frame-origin'
  | 'frame-size'
  | 'unknown-color'
  | 'multicolor'
  | 'inline-style'
  | 'style-block'
  | 'paint-server'
  | 'opacity'
  | 'stroke'
  | 'non-scaling-stroke'
  | 'mask'
  | 'clip-path'
  | 'filter'
  | 'raster-image';

export interface IconQualityIssue {
  kind: IconQualityIssueKind;
  severity: IconQualityIssueSeverity;
  message: string;
}

export interface IconQualityMetadata {
  state: IconQualityState;
  issues: IconQualityIssue[];
}

export interface IconFigmaLink {
  componentId: string | null;
  componentKey: string | null;
  lastSyncedHash: string | null;
}

export interface IconCodeMetadata {
  exportName: string;
}

export interface ManagedIcon {
  id: string;
  name: string;
  path: string;
  componentName: string;
  source: IconSource;
  svg: IconSvgMetadata;
  figma: IconFigmaLink;
  code: IconCodeMetadata;
  quality: IconQualityMetadata;
  status: IconStatus;
  tags?: string[];
}

export interface IconRegistrySettings {
  componentPrefix: string;
  defaultSize: number;
  pageName: string;
}

export interface IconRegistryFile {
  $schema?: string;
  icons: ManagedIcon[];
  settings: IconRegistrySettings;
}
