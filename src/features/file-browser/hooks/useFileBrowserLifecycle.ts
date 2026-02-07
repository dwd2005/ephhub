import React, { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';

interface LifecycleParams {
  currentRootId: string | null;
  currentPath: string;
  viewMode: ViewMode;
  clearSelection: () => void;
  tabs: TabInfo[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, payload: Partial<TabInfo>) => void;
  deriveTitle: (rootId: string | null, path: string) => string;
  setRoots: (roots: Root[], lastRootId?: string | null) => void;
  addTab: (tab: TabInfoInput) => void;
  setCurrentRootId: (id: string | null) => void;
  setCurrentPath: (path: string) => void;
  applyFsChange: (payload: { rootId: string; type: 'add' | 'delete' | 'change'; path: string }) => void;
  setTreeRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  closeContextMenu: () => void;
  setOperation: (payload: OperationStatus) => void;
  clearOperation: (path: string) => void;
  handle: <T>(promise: Promise<T>) => Promise<T>;
}

export const useFileBrowserLifecycle = ({
  currentRootId,
  currentPath,
  viewMode,
  clearSelection,
  tabs,
  activeTab,
  setActiveTab,
  updateTab,
  deriveTitle,
  setRoots,
  addTab,
  setCurrentRootId,
  setCurrentPath,
  applyFsChange,
  setTreeRefreshKey,
  closeContextMenu,
  setOperation,
  clearOperation,
  handle
}: LifecycleParams) => {
  // guard against duplicate listener registration in React 18 strict/dev
  const onceRef = useRef(false);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, currentPath, viewMode, currentRootId]);

  useEffect(() => {
    if (!activeTab && tabs.length) {
      setActiveTab(tabs[0].id);
    } else if (activeTab && !tabs.find((t) => t.id === activeTab) && tabs.length) {
      setActiveTab(tabs[tabs.length - 1].id);
    }
  }, [activeTab, setActiveTab, tabs]);

  useEffect(() => {
    if (!activeTab) return;
    const title = deriveTitle(currentRootId, currentPath);
    updateTab(activeTab, { path: currentPath, rootId: currentRootId || undefined, title });
  }, [activeTab, currentPath, currentRootId, deriveTitle, updateTab]);

  useEffect(() => {
    const handleGlobalClick = () => closeContextMenu();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [closeContextMenu]);

  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;

    const bootstrap = async () => {
      const config = await handle(window.api.getConfig());
      setRoots(config.roots, config.lastRootId);
      if (config.roots.length && !useStore.getState().tabs.length) {
        const initialRoot = config.lastRootId || config.roots[0].id;
        addTab({ rootId: initialRoot, path: '.', title: deriveTitle(initialRoot, '.') });
        const latest = useStore.getState().tabs.slice(-1)[0];
        if (latest) setActiveTab(latest.id);
      }
    };

    bootstrap();
    window.api.onFsChange((payload) => {
      applyFsChange(payload);
      setTreeRefreshKey((v) => v + 1);
    });
    window.api.onOperationStart((payload) => setOperation(payload));
    window.api.onOperationEnd((payload) => clearOperation(payload.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
