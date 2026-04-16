import { createRoot } from 'react-dom/client';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { TokenDataProvider } from './contexts/TokenDataContext';
import { CollectionProvider } from './contexts/CollectionContext';
import { InspectProvider } from './contexts/InspectContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { EditorProvider } from './contexts/EditorContext';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <ConnectionProvider>
    <TokenDataProvider>
      <CollectionProvider>
        <InspectProvider>
          <NavigationProvider>
            <EditorProvider>
              <App />
            </EditorProvider>
          </NavigationProvider>
        </InspectProvider>
      </CollectionProvider>
    </TokenDataProvider>
  </ConnectionProvider>,
);
