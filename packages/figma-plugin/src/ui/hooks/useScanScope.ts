import { useState } from 'react';
import type { ScanScope } from '../../shared/types';

/**
 * Manages scan scope state with support for both controlled and uncontrolled modes.
 *
 * When `externalValue` is provided the hook defers to the external value and calls
 * `externalOnChange` on updates (controlled). Otherwise it manages its own state
 * (uncontrolled). This mirrors the pattern used in ConsistencyPanel where the scope
 * may be driven by a parent panel (CanvasAnalysisPanel) or owned locally.
 */
export function useScanScope(
  externalValue?: ScanScope,
  externalOnChange?: (scope: ScanScope) => void,
  initial: ScanScope = 'page',
): [ScanScope, (scope: ScanScope) => void] {
  const [internal, setInternal] = useState<ScanScope>(initial);
  const value = externalValue ?? internal;
  const onChange = externalOnChange ?? setInternal;
  return [value, onChange];
}
