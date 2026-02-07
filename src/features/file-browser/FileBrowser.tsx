import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Space } from 'antd';
import dayjs from 'dayjs';
import { FolderOpenOutlined } from '@ant-design/icons';
import { useStore } from '@/store/useStore';
import SideBar from '@/components/SideBar';
import MessageHub from '@/components/MessageHub';
import ContextMenu from '@/components/ContextMenu';
import TopBar from './components/TopBar';
import PathSearchBar from './components/PathSearchBar';
import ActionRibbon from './components/ActionRibbon';
import FileDisplay from './components/FileDisplay';
import { useApiHelpers } from './hooks/useApiHelpers';
import { useFileOperations } from './hooks/useFileOperations';
import { useSelectionBox } from './hooks/useSelectionBox';
import { usePathNavigation } from './hooks/usePathNavigation';
import { useContextMenus } from './hooks/useContextMenus';
import { useFileBrowserLifecycle } from './hooks/useFileBrowserLifecycle';
import './file-browser.css';

const levelTagOptions: { key: LevelTag; label: string }[] = [
  { key: 'important', label: '重要' },
  { key: 'normal', label: '普通' },
  { key: 'temp', label: '临时' },
  { key: null, label: '全部' }
];

const normalizeRelPath = (p: string) => p.replace(/\\/g, '/');
const isSamePath = (a: string, b: string) => normalizeRelPath(a) === normalizeRelPath(b);
const parentPathOf = (p: string) => {
  const n = normalizeRelPath(p);
  const idx = n.lastIndexOf('/');
  if (idx === -1) return '.';
  const parent = n.slice(0, idx);
  return parent || '.';
};

const FileBrowser: React.FC = () => {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const isResizing = useRef(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResize = (e: MouseEvent) => {
    if (isResizing.current) {
      setSidebarWidth(e.clientX);
    }
  };

  const handleResizeEnd = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const {
    roots,
    setRoots,
    currentRootId,
    setCurrentRootId,
    currentPath,
    setCurrentPath,
    viewMode,
    setViewMode,
    displayMode,
    setDisplayMode,
    files,
    setFiles,
    selected,
    setSelected,
    selectSingle,
    clearSelection,
    addMessage,
    setTimeBuckets,
    timeBuckets,
    operationStatus,
    setOperation,
    clearOperation,
    tabs,
    addTab,
    closeTab,
    updateTab,
    renamingPath,
    setRenamingPath,
    clipboard,
    setClipboard,
    reorderTabs
  } = useStore();

  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement>>({});
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const { handle } = useApiHelpers();
  const { message } = App.useApp();
  const [searchValue, setSearchValue] = useState('');
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>('recursive');
  const [filterType, setFilterType] = useState<SearchType>('all');
  const [filterLevel, setFilterLevel] = useState<LevelTag | 'all' | 'none'>('all');
  const [filterExts, setFilterExts] = useState<string[]>([]);
  const [timeField, setTimeField] = useState<SearchTimeField>('none');
  const [timeRange, setTimeRange] = useState<[any, any]>([null, null]);
  const searchWarnedRef = useRef(false);
  const rootIdRef = useRef<string | null>(currentRootId);

  const deriveTitle = useCallback(
    (rootId: string | null, path: string) => {
      const root = roots.find((r) => r.id === rootId);
      if (!path || path === '.') return root?.name || '未命名';
      const parts = path.split(/[\\/]/).filter(Boolean);
      return parts[parts.length - 1] || root?.name || '未命名';
    },
    [roots]
  );

  const {
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
  } = usePathNavigation(roots, currentRootId, currentPath, setCurrentPath);

  const isSearchActive = useMemo(() => {
    const hasKeyword = !!searchValue.trim();
    const hasExt = filterExts.length > 0;
    const hasTime = timeField !== 'none' && (timeRange[0] || timeRange[1]);
    return (
      hasKeyword ||
      searchRegex ||
      searchScope !== 'recursive' ||
      filterType !== 'all' ||
      filterLevel !== 'all' ||
      hasExt ||
      hasTime
    );
  }, [filterExts.length, filterLevel, filterType, searchRegex, searchScope, searchValue, timeField, timeRange]);

  const refresh = useCallback(async () => {
    const state = useStore.getState();
    if (!state.currentRootId) return;
    setLoading(true);
    try {
      if (state.viewMode === 'physical') {
        if (isSearchActive) {
          const from = timeRange[0] ? dayjs(timeRange[0]).valueOf() : null;
          const to = timeRange[1] ? dayjs(timeRange[1]).valueOf() : null;
          const list = await handle(
            window.api.search({
              rootId: state.currentRootId,
              relativePath: state.currentPath,
              options: {
                keyword: searchValue.trim(),
                useRegex: searchRegex,
                scope: searchScope,
                type: filterType,
                levelTag: filterLevel,
                exts: filterExts,
                time: { field: timeField, from, to }
              }
            }),
            { onRetry: refresh }
          );
          setFiles(list);
        } else {
          const list = await handle(
            window.api.list({ rootId: state.currentRootId, relativePath: state.currentPath }),
            { onRetry: refresh }
          );
          setFiles(list);
        }
      } else {
        if (isSearchActive && !searchWarnedRef.current) {
          message.info('时间视图暂不支持筛选');
          searchWarnedRef.current = true;
        }
        const buckets = await handle(window.api.timeBuckets({ rootId: state.currentRootId }), {
          onRetry: refresh
        });
        setTimeBuckets(buckets);
      }
    } finally {
      setLoading(false);
    }
  }, [
    filterExts,
    filterLevel,
    filterType,
    handle,
    isSearchActive,
    message,
    searchRegex,
    searchScope,
    searchValue,
    setFiles,
    setTimeBuckets,
    timeField,
    timeRange
  ]);

  useEffect(() => {
    if (viewMode !== 'time') {
      searchWarnedRef.current = false;
    }
  }, [viewMode]);

  useEffect(() => {
    rootIdRef.current = currentRootId;
  }, [currentRootId]);

  useEffect(() => {
    if (!currentRootId) return;
    refresh();
  }, [currentRootId, currentPath, viewMode, refresh]);

  useEffect(() => {
    if (!rootIdRef.current) return;
    const timer = setTimeout(() => {
      refresh();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    filterExts,
    filterLevel,
    filterType,
    refresh,
    searchRegex,
    searchScope,
    searchValue,
    timeField,
    timeRange
  ]);
  const applyFsChange = useCallback(
    async (payload: { rootId: string; type: 'add' | 'delete' | 'change'; path: string }) => {
      const state = useStore.getState();
      if (!state.currentRootId || payload.rootId !== state.currentRootId) return;
      if (state.viewMode === 'time') {
        refresh();
        return;
      }

      if (isSearchActive) {
        refresh();
        return;
      }

      const parent = parentPathOf(payload.path);
      if (parent !== state.currentPath) return;

      if (payload.type === 'delete') {
        setFiles((prev) => prev.filter((f) => !isSamePath(f.relativePath, payload.path)));
        setSelected((prev) => prev.filter((p) => !isSamePath(p, payload.path)));
        return;
      }

      try {
        const list = await handle(
          window.api.list({ rootId: state.currentRootId, relativePath: parent })
        );
        const target = list.find((f) => isSamePath(f.relativePath, payload.path));
        if (!target) return;

        setFiles((prev) => {
          const exists = prev.some((f) => isSamePath(f.relativePath, target.relativePath));
          if (exists) {
            return prev.map((f) => (isSamePath(f.relativePath, target.relativePath) ? target : f));
          }

          const orderMap = list.reduce<Record<string, number>>((acc, f, idx) => {
            acc[normalizeRelPath(f.relativePath)] = idx;
            return acc;
          }, {});
          const next = [...prev.filter((f) => !isSamePath(f.relativePath, target.relativePath)), target];
          return next.sort(
            (a, b) =>
              (orderMap[normalizeRelPath(a.relativePath)] ?? 0) -
              (orderMap[normalizeRelPath(b.relativePath)] ?? 0)
          );
        });
      } catch (err) {
        refresh();
      }
    },
    [handle, isSearchActive, refresh, setFiles, setSelected]
  );

  const {
    openAddRoot,
    handleNewFolder,
    handleRemoveRoot,
    handleDelete,
    handleMoveOrCopy,
    handleCopyOrCut,
    handlePaste,
    handleSetLevel,
    handleSetLevelForPaths,
    clearTemp,
    handleCleanTemp,
    handleSetCustomTime,
    onOpen,
    handleRenameSubmit,
    promptNewFile
  } = useFileOperations({ roots, currentRootId, currentPath, setCurrentPath, viewMode, refresh });

  const { selectionBox, handleMouseDown, handleMouseMove, handleMouseUp } = useSelectionBox(
    fileAreaRef,
    fileRefs
  );

  const {
    menuState,
    closeContextMenu,
    menuItems,
    handleFileContextMenu,
    handleBlankContextMenu
  } = useContextMenus({
    currentRootId,
    selected,
    onOpen,
    handleCopyOrCut,
    handlePaste,
    handleCleanTemp,
    handleSetCustomTime,
    handleSetLevelForPaths,
    setRenamingPath,
    handleNewFolder,
    promptNewFile,
    handleCleanTempRoot: () => handleCleanTemp()
  });

  useFileBrowserLifecycle({
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
  });

  const handleFileAreaDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleFileAreaDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!currentRootId) return;
    const paths = Array.from(e.dataTransfer.files || [])
      .map((f) => (f as any).path as string)
      .filter(Boolean);
    if (!paths.length) return;
    await handle(
      window.api.importExternal({
        rootId: currentRootId,
        relativePath: currentPath,
        files: paths
      })
    );
    refresh();
  };

  const handleFileClick = (e: React.MouseEvent, file: FileEntry) => {
    e.stopPropagation();
    if (renamingPath) {
      setRenamingPath(null);
      return;
    }
    if (selected.length === 0 || !selected.includes(file.relativePath)) {
      selectSingle(file.relativePath);
    }
  };

  const handleFileNameClick = (e: React.MouseEvent, file: FileEntry) => {
    e.stopPropagation();
    if ((e.detail || 1) > 1) return;
    if (selected.includes(file.relativePath)) {
      setRenamingPath(file.relativePath);
    } else {
      selectSingle(file.relativePath);
    }
  };

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        key: tab.id,
        label: (
          <Space size={6}>
            <FolderOpenOutlined />
            <span>{tab.title}</span>
          </Space>
        ),
        closable: tabs.length > 1
      })),
    [tabs]
  );

  const addNewTab = () => {
    if (!currentRootId) return;
    const title = deriveTitle(currentRootId, currentPath);
    addTab({ rootId: currentRootId, path: currentPath, title });
    const latest = useStore.getState().tabs.slice(-1)[0];
    if (latest) setActiveTab(latest.id);
  };

  const onEditTabs = (targetKey: any, action: 'add' | 'remove') => {
    if (action === 'add') addNewTab();
    if (action === 'remove') closeTab(targetKey as string);
  };

  const operationsBusy = Object.keys(operationStatus).length > 0;

  return (
    <div className="app-shell">
      <TopBar
        tabItems={tabItems}
        activeTab={activeTab}
        onTabChange={(key) => {
          setActiveTab(key);
          const target = tabs.find((t) => t.id === key);
          if (target) {
            setCurrentRootId(target.rootId);
            setCurrentPath(target.path);
          }
        }}
        onEditTabs={onEditTabs}
        onReorderTabs={reorderTabs}
        onMinimize={() => window.api.windowMinimize()}
        onMaximize={() => window.api.windowToggleMaximize()}
        onClose={() => window.api.windowClose()}
      />

      <PathSearchBar
        breadcrumb={breadcrumb}
        pathInputMode={pathInputMode}
        pathInputValue={pathInputValue}
        setPathInputMode={setPathInputMode}
        setPathInputValue={setPathInputValue}
        pathInputRef={pathInputRef}
        onPathSubmit={handlePathInputSubmit}
        onPathKeyDown={handlePathInputKeyDown}
        onPathFocus={handlePathInputFocus}
        onBreadcrumbClick={handleBreadcrumbClick}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((prev) => !prev)}
        onBack={handleGoBack}
        onRefresh={refresh}
        levelTagOptions={levelTagOptions}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={`从「${deriveTitle(currentRootId, currentPath)}」中搜索`}
        searchDisabled={viewMode === 'time'}
        searchRegex={searchRegex}
        onSearchRegexChange={setSearchRegex}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        filterLevel={filterLevel}
        onFilterLevelChange={setFilterLevel}
        filterExts={filterExts}
        onFilterExtsChange={setFilterExts}
        timeField={timeField}
        onTimeFieldChange={setTimeField}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        onClearFilters={() => {
          setSearchValue('');
          setSearchRegex(false);
          setSearchScope('recursive');
          setFilterType('all');
          setFilterLevel('all');
          setFilterExts([]);
          setTimeField('none');
          setTimeRange([null, null]);
        }}
      />

      <div className="content-area">
        <div className="sidebar" style={{ width: sidebarWidth, minWidth: 200, maxWidth: 600 }}>
          <SideBar
            roots={roots}
            currentRootId={currentRootId}
            currentPath={currentPath}
            onSelectRoot={(id) => setCurrentRootId(id)}
            onAddRoot={openAddRoot}
            onRemoveRoot={(id) => handleRemoveRoot(id)}
            onSelectPath={(p) => setCurrentPath(p)}
            treeRefreshKey={treeRefreshKey}
          />
          <div 
            className="sidebar-resizer"
            onMouseDown={handleResizeStart}
            style={{ cursor: 'col-resize', width: 5, height: '100%', position: 'absolute', right: 0, top: 0 }}
          />
        </div>

        <div className="file-area">
          <ActionRibbon
            onNewFolder={handleNewFolder}
            onSetLevel={handleSetLevel}
            onMoveOrCopy={handleMoveOrCopy}
            onDelete={handleDelete}
            onSelectAll={() => setSelected(files.map((f) => f.relativePath))}
            onClearSelection={clearSelection}
            onClearTemp={clearTemp}
            viewMode={viewMode}
            setViewMode={setViewMode}
            displayMode={displayMode}
            setDisplayMode={setDisplayMode}
            operationsBusy={operationsBusy}
          />

          <FileDisplay
            loading={loading}
            currentRootId={currentRootId}
            openAddRoot={openAddRoot}
            viewMode={viewMode}
            timeBuckets={timeBuckets}
            displayMode={displayMode}
            files={files}
            selected={selected}
            renamingPath={renamingPath}
            setRenamingPath={setRenamingPath}
            operationStatus={operationStatus}
            fileRefs={fileRefs}
            fileAreaRef={fileAreaRef}
            selectionBox={selectionBox}
            onFileAreaMouseDown={handleMouseDown}
            onFileAreaMouseMove={handleMouseMove}
            onFileAreaMouseUp={handleMouseUp}
            onFileAreaDragOver={handleFileAreaDragOver}
            onFileAreaDrop={handleFileAreaDrop}
            onBlankContextMenu={handleBlankContextMenu}
            onFileClick={handleFileClick}
            onFileContextMenu={handleFileContextMenu}
            onFileNameClick={handleFileNameClick}
            onRenameSubmit={handleRenameSubmit}
            onOpen={onOpen}
            searchTerm={searchValue}
            searchRegex={searchRegex}
          />
        </div>
      </div>

      <ContextMenu
        visible={menuState.visible}
        position={menuState.position}
        items={menuItems}
        onClose={closeContextMenu}
      />
      <MessageHub />
    </div>
  );
};

export default FileBrowser;







