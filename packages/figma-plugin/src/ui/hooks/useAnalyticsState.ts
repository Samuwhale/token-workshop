import { useState } from 'react';

export function useAnalyticsState() {
  const [validateKey, setValidateKey] = useState(0);
  const [analyticsIssueCount, setAnalyticsIssueCount] = useState<number | null>(null);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [showValidationReturn, setShowValidationReturn] = useState(false);

  return {
    validateKey, setValidateKey,
    analyticsIssueCount, setAnalyticsIssueCount,
    showIssuesOnly, setShowIssuesOnly,
    showValidationReturn, setShowValidationReturn,
  };
}
