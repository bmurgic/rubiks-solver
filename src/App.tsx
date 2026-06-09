import { lazy, Suspense, useMemo, useState } from 'react';
import { solved } from './core/cube-model/state';
import { toFacelets } from './core/facelets/facelets';
import { ErrorBoundary } from './view/ErrorBoundary';

const CubeView = lazy(() =>
  import('./view/CubeView').then((m) => ({ default: m.CubeView })),
);

const APP_STYLE: React.CSSProperties = { width: '100vw', height: '100vh' };
const FALLBACK_STYLE: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: '100%',
};

export default function App() {
  const [state] = useState(solved());
  const facelets = useMemo(() => toFacelets(state), [state]);
  return (
    <div data-testid="app" style={APP_STYLE}>
      <ErrorBoundary>
        <Suspense fallback={<div style={FALLBACK_STYLE}>Loading cube…</div>}>
          <CubeView facelets={facelets} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
