import { useCallback, useMemo, useRef, useState } from 'react';

export const usePathNavigation = (
  roots: Root[],
  currentRootId: string | null,
  currentPath: string,
  setCurrentPath: (path: string) => void
) => {
  const [pathInputMode, setPathInputMode] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const pathInputRef = useRef<any>(null);

  const breadcrumb = useMemo(() => {
    const root = roots.find((r) => r.id === currentRootId);
    const pathParts = currentPath.split(/[\\/]/).filter(Boolean);
    const items: Array<{ title: string; path: string }> = [];

    if (root) {
      items.push({ title: root.name, path: '.' });
    }

    let currentPathAccum = '';
    pathParts.forEach((part) => {
      currentPathAccum = currentPathAccum ? `${currentPathAccum}/${part}` : part;
      items.push({ title: part, path: currentPathAccum });
    });

    return items;
  }, [currentPath, currentRootId, roots]);

  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      setCurrentPath(path);
    },
    [setCurrentPath]
  );

  const handlePathInputSubmit = useCallback(() => {
    const inputPath = pathInputValue.trim();
    if (!inputPath) {
      setPathInputMode(false);
      return;
    }

    const root = roots.find((r) => r.id === currentRootId);
    if (!root) {
      setPathInputMode(false);
      return;
    }

    const normalizedInput = inputPath.replace(/\\/g, '/');
    const normalizedRoot = root.path.replace(/\\/g, '/');

    if (normalizedInput.startsWith(normalizedRoot)) {
      const relativePath = normalizedInput.slice(normalizedRoot.length).replace(/^\//, '') || '.';
      setCurrentPath(relativePath);
    } else {
      setCurrentPath(normalizedInput || '.');
    }

    setPathInputMode(false);
  }, [currentRootId, pathInputValue, roots, setCurrentPath]);

  const handlePathInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handlePathInputSubmit();
      } else if (e.key === 'Escape') {
        setPathInputMode(false);
      }
    },
    [handlePathInputSubmit]
  );

  const handlePathInputFocus = useCallback(() => {
    const root = roots.find((r) => r.id === currentRootId);
    const fullPath = currentPath === '.' ? root?.path || '' : `${root?.path || ''}/${currentPath}`;
    setPathInputValue(fullPath);
    setTimeout(() => pathInputRef.current?.select(), 0);
  }, [currentPath, currentRootId, roots]);

  const handleGoBack = useCallback(() => {
    if (currentPath === '.' || !currentPath) return;
    const pathParts = currentPath.split(/[\\/]/).filter(Boolean);
    if (pathParts.length === 0) {
      setCurrentPath('.');
    } else {
      const parentPath = pathParts.slice(0, -1).join('/');
      setCurrentPath(parentPath || '.');
    }
  }, [currentPath, setCurrentPath]);

  return {
    breadcrumb,
    pathInputMode,
    setPathInputMode,
    pathInputValue,
    setPathInputValue,
    pathInputRef,
    handleBreadcrumbClick,
    handlePathInputSubmit,
    handlePathInputKeyDown,
    handlePathInputFocus,
    handleGoBack
  };
};
