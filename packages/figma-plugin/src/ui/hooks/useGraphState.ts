import { useState } from 'react';

export function useGraphState() {
  const [pendingGraphTemplate, setPendingGraphTemplate] = useState<string | null>(null);
  const [pendingGraphFromGroup, setPendingGraphFromGroup] = useState<{ groupPath: string; tokenType: string | null } | null>(null);
  const [focusGeneratorId, setFocusGeneratorId] = useState<string | null>(null);
  const [pendingOpenPicker, setPendingOpenPicker] = useState(false);

  return {
    pendingGraphTemplate, setPendingGraphTemplate,
    pendingGraphFromGroup, setPendingGraphFromGroup,
    focusGeneratorId, setFocusGeneratorId,
    pendingOpenPicker, setPendingOpenPicker,
  };
}
