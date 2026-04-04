import { createRoot } from 'react-dom/client';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { TokenDataProvider } from './contexts/TokenDataContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { InspectProvider } from './contexts/InspectContext';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ConnectionProvider>
    <TokenDataProvider>
      <ThemeProvider>
        <InspectProvider>
          <App />
        </InspectProvider>
      </ThemeProvider>
    </TokenDataProvider>
  </ConnectionProvider>,
);
