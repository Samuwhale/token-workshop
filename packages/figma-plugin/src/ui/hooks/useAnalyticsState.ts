import { useState } from 'react';

export function useAnalyticsState() {
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);

  return {
    showIssuesOnly, setShowIssuesOnly,
  };
}
