import { createContext, useContext } from "react";
import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import type { TokenListImperativeHandle } from "../components/tokenListTypes";
import type { PublishPanelHandle } from "../components/PublishPanel";
import type { StartHereBranch } from "../components/WelcomePrompt";
import type { LintViolation } from "../hooks/useLint";
import type {
  ValidationIssue,
  ValidationSnapshot,
} from "../hooks/useValidationCache";
import type { OperationEntry } from "../hooks/useRecentOperations";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenNode } from "../hooks/useTokens";
import type { RecentlyTouchedState } from "../hooks/useRecentlyTouched";
import type { StarredTokensState } from "../hooks/useStarredTokens";
import type { NotificationEntry } from "../hooks/useToastStack";
import type { ImportCompletionResult } from "../components/ImportPanelContext";
import type { PublishPreflightState } from "../shared/syncWorkflow";
import type { PublishPending } from "../hooks/useFigmaSync";
import type { DerivationOp } from "@tokenmanager/core";

export interface ShellWorkspaceController {
  openPasteModal: () => void;
  openImportPanel: () => void;
  openCollectionCreateDialog: () => void;
  openGraphWorkspace: () => void;
  toggleQuickApply: () => void;
  triggerCreateFromSelection: () => void;
  triggerExtractFromSelection: () => void;
  openCollectionPicker: () => void;
  collectionPickerFocusRequestKey: number;
  openStartHere: (branch?: StartHereBranch) => void;
  restartGuidedSetup: () => void;
  handleClearAllComplete: () => void;
  handleImportComplete: (result: ImportCompletionResult) => void;
  notificationHistory: NotificationEntry[];
  clearNotificationHistory: () => void;
}

export interface EditorShellController {
  guardEditorAction: (fn: () => void) => void;
  registerEditorSession: (session: EditorSessionRegistration | null) => void;
  requestEditorClose: () => void;
  displayedLeafNodesRef: MutableRefObject<TokenNode[]>;
  tokenListCompareRef: MutableRefObject<TokenListImperativeHandle | null>;
  handleEditorNavigate: (direction: 1 | -1) => void;
  handleEditorSave: (
    savedPath: string,
    savedCollectionId: string,
  ) => void;
  availableFonts: string[];
  fontWeightsByFamily: Record<string, number[]>;
}

export interface EditorSessionRegistration {
  isDirty: boolean;
  canSave: boolean;
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
  closeWhenClean: () => void;
}

export interface TokensWorkspaceController {
  showIssuesOnly: boolean;
  setShowIssuesOnly: Dispatch<SetStateAction<boolean>>;
  lintViolations: LintViolation[];
  jumpToNextIssue: () => void;
  refreshAll: () => void;
  pushUndo: (slot: UndoSlot) => void;
  setErrorToast: (message: string) => void;
  setSuccessToast: (message: string) => void;
  handleNavigateToCollection: (collectionId: string, tokenPath: string) => void;
  tokenListCompareRef: MutableRefObject<TokenListImperativeHandle | null>;
  tokenListSelection: string[];
  recentlyTouched: RecentlyTouchedState;
  starredTokens: StarredTokensState;
  handleOpenCrossCollectionCompare: (path: string) => void;
  handlePaletteDuplicate: (path: string, collectionId: string) => Promise<void>;
  handlePaletteRename: (path: string, collectionId: string) => void;
  handlePaletteMove: (path: string, collectionId: string) => void;
  requestPaletteDelete: (
    paths: string[],
    label: string,
    collectionId?: string,
  ) => void;
  handlePaletteDeleteToken: (path: string, collectionId: string) => void;
  applyAliasRewire: (params: {
    tokenPath: string;
    tokenCollectionId: string;
    targetPath: string;
    targetCollectionId: string;
    modeNames: string[];
  }) => Promise<{ ok: boolean; error?: string }>;
  applyAliasDetach: (params: {
    tokenPath: string;
    tokenCollectionId: string;
    modeLiterals: Record<string, unknown>;
  }) => Promise<{ ok: boolean; error?: string }>;
  createAliasToken: (params: {
    newPath: string;
    collectionId: string;
    type: string | undefined;
    targetPath: string;
    targetCollectionId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  createDerivationToken: (params: {
    newPath: string;
    collectionId: string;
    type: string | undefined;
    sourcePath: string;
    sourceCollectionId: string;
    derivationOps: DerivationOp[];
  }) => Promise<{ ok: boolean; error?: string }>;
}

export interface ApplyWorkspaceController {
  triggerCreateToken: number;
  triggerExtractToken: number;
}

export interface SyncWorkspaceController {
  validationIssues: ValidationIssue[] | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
  recentOperations: OperationEntry[];
  totalOperations: number;
  hasMoreOperations: boolean;
  loadMoreOperations: () => void;
  handleRollback: (id: string) => void;
  redoableItems: Array<{ origOpId: string; description: string }>;
  handleServerRedo: (id?: string) => void;
  undoDescriptions: string[];
  redoableOpIds: Set<string>;
  executeUndo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  redoSlot: UndoSlot | null;
  executeRedo: () => void;
  setPublishPending: (value: PublishPending | null) => void;
  tokenChangeKey: number;
  publishPanelHandleRef: MutableRefObject<PublishPanelHandle | null>;
  publishPreflightState: PublishPreflightState;
  pendingPublishCount: number;
  publishApplying: boolean;
}

export interface CollectionStructureWorkspaceController {
  onCreateCollectionByName: (name: string) => Promise<string>;
  onRename: (
    oldName: string,
    newName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDuplicate: (collectionId: string) => void;
  onDelete: (collectionId: string) => void;
  onEditInfo: (collectionId: string) => void;
  onMerge?: (collectionId: string) => void;
  onSplit: (collectionId: string) => void;
  editingMetadataCollectionId: string | null;
  metadataDescription: string;
  setMetadataDescription: (value: string) => void;
  onMetadataSave: () => void;
  deletingCollectionId: string | null;
  onDeleteConfirm: () => void | Promise<void>;
  onDeleteCancel: () => void;
  mergingCollectionId: string | null;
  mergeTargetCollectionId: string;
  mergeConflicts: Array<{
    path: string;
    sourceValue: unknown;
    targetValue: unknown;
  }>;
  mergeResolutions: Record<string, "source" | "target">;
  mergeChecked: boolean;
  mergeLoading: boolean;
  onMergeTargetChange: (target: string) => void;
  setMergeResolutions: (
    updater:
      | Record<string, "source" | "target">
      | ((
          prev: Record<string, "source" | "target">,
        ) => Record<string, "source" | "target">),
  ) => void;
  onMergeCheckConflicts: () => void | Promise<void>;
  onMergeConfirm: () => void | Promise<void>;
  onMergeClose: () => void;
  splittingCollectionId: string | null;
  splitPreview: Array<{ key: string; newCollectionId: string; count: number }>;
  splitDeleteOriginal: boolean;
  splitLoading: boolean;
  setSplitDeleteOriginal: (value: boolean) => void;
  onSplitConfirm: () => void | Promise<void>;
  onSplitClose: () => void;
}

export interface WorkspaceControllerValue {
  shell: ShellWorkspaceController;
  editor: EditorShellController;
  tokens: TokensWorkspaceController;
  apply: ApplyWorkspaceController;
  sync: SyncWorkspaceController;
  collectionStructure: CollectionStructureWorkspaceController;
}

const WorkspaceControllerContext =
  createContext<WorkspaceControllerValue | null>(null);

export function WorkspaceControllerProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WorkspaceControllerValue;
}) {
  return (
    <WorkspaceControllerContext.Provider value={value}>
      {children}
    </WorkspaceControllerContext.Provider>
  );
}

function useWorkspaceControllerContext(): WorkspaceControllerValue {
  const value = useContext(WorkspaceControllerContext);
  if (!value) {
    throw new Error(
      "useWorkspaceControllerContext must be used inside WorkspaceControllerProvider",
    );
  }
  return value;
}

export function useShellWorkspaceController(): ShellWorkspaceController {
  return useWorkspaceControllerContext().shell;
}

export function useEditorShellController(): EditorShellController {
  return useWorkspaceControllerContext().editor;
}

export function useTokensWorkspaceController(): TokensWorkspaceController {
  return useWorkspaceControllerContext().tokens;
}

export function useApplyWorkspaceController(): ApplyWorkspaceController {
  return useWorkspaceControllerContext().apply;
}

export function useSyncWorkspaceController(): SyncWorkspaceController {
  return useWorkspaceControllerContext().sync;
}

export function useCollectionStructureWorkspaceController(): CollectionStructureWorkspaceController {
  return useWorkspaceControllerContext().collectionStructure;
}
