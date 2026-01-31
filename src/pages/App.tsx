import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Modal,
  Segmented,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Space,
  Breadcrumb
} from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FileOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScissorOutlined,
  SearchOutlined,
  SwapOutlined,
  TagOutlined,
  UnorderedListOutlined,
  PlusOutlined as PlusTabOutlined,
  CloseOutlined,
  MinusOutlined,
  BorderOutlined
} from '@ant-design/icons';
import { useStore } from '@/store/useStore';
import { formatSize, formatTime, levelTagMeta } from '@/utils/format';
import SideBar from '@/ui/SideBar';
import MessageHub from '@/ui/MessageHub';
import TimeView from '@/ui/TimeView';
import './app.css';

const levelTagOptions: { key: LevelTag; label: string }[] = [
  { key: 'important', label: '重要' },
  { key: 'normal', label: '常规' },
  { key: 'temp', label: '临时' },
  { key: null, label: '全部' }
];

function useApiHelpers() {
  const { message } = AntApp.useApp();
  const handle = async <T,>(promise: Promise<ApiResult<T> | T>) => {
    const res: any = await promise;
    if (res && typeof res === 'object' && 'ok' in res) {
      if (!res.ok) {
        message.error(res.message || '操作失败');
        throw new Error(res.message);
      }
      return res.data as T;
    }
    return res as T;
  };
  return { handle };
}

const App: React.FC = () => {
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
    toggleSelect,
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
    selectionBox,
    setSelectionBox,
    isDragging,
    setIsDragging
  } = useStore();
  const [activeTab, setActiveTab] = useState<string>('');

  const { message } = AntApp.useApp();
  const { handle } = useApiHelpers();
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pathInputMode, setPathInputMode] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const pathInputRef = useRef<any>(null);
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const deriveTitle = (rootId: string | null, path: string) => {
    const root = roots.find((r) => r.id === rootId);
    if (!path || path === '.') return root?.name || '未命名';
    const parts = path.split(/[\/]/).filter(Boolean);
    return parts[parts.length - 1] || root?.name || '未命名';
  };

  useEffect(() => {
    bootstrap();
    window.api.onFsChange((payload) => {
      const active = useStore.getState().currentRootId;
      if (payload.rootId === active) {
        refresh();
      }
    });
    window.api.onOperationStart((payload) => setOperation(payload));
    window.api.onOperationEnd((payload) => clearOperation(payload.path));
  }, []);

  useEffect(() => {
    if (currentRootId) {
      refresh();
    }
  }, [currentRootId, currentPath, viewMode]);

  useEffect(() => {
    clearSelection();
  }, [currentPath, viewMode, currentRootId]);

  useEffect(() => {
    if (!activeTab && tabs.length) {
      setActiveTab(tabs[0].id);
    } else if (activeTab && !tabs.find((t) => t.id === activeTab) && tabs.length) {
      setActiveTab(tabs[tabs.length - 1].id);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    if (!activeTab) return;
    const title = deriveTitle(currentRootId, currentPath);
    updateTab(activeTab, { path: currentPath, rootId: currentRootId || undefined, title });
  }, [currentPath, currentRootId, activeTab]);

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

  const refresh = async () => {
    const state = useStore.getState();
    if (!state.currentRootId) return;
    setLoading(true);
    try {
      if (state.viewMode === 'physical') {
        const list = await handle(
          window.api.list({ rootId: state.currentRootId, relativePath: state.currentPath })
        );
        setFiles(list);
      } else {
        const buckets = await handle(window.api.timeBuckets({ rootId: state.currentRootId }));
        setTimeBuckets(buckets);
      }
    } finally {
      setLoading(false);
    }
  };

  const openAddRoot = async () => {
    const picked = await handle<string | null>(window.api.chooseRoot());
    if (!picked) return;
    const name = picked.split(/[\/]/).pop() || picked;
    const newRoot = await handle(window.api.addRoot({ name, path: picked }));
    setRoots([...roots, newRoot], newRoot.id);
  };

  const handleNewFolder = () => {
    let inputRef: any = null;
    Modal.confirm({
      title: '新建文件夹',
      content: <Input placeholder="文件夹名称" ref={(ref) => (inputRef = ref)} />,   
      onOk: async () => {
        const value = inputRef?.input?.value?.trim();
        if (!value) return Promise.reject();
        await handle(
          window.api.createFolder({
            rootId: currentRootId!,
            relativePath: currentPath,
            name: value
          })
        );
        refresh();
      }
    });
  };

  const handleUpload = async () => {
    const picked = await handle<string[]>(window.api.chooseFiles());
    if (!picked?.length) return;
    await handle(
      window.api.upload({ rootId: currentRootId!, relativePath: currentPath, files: picked })
    );
    refresh();
  };

  const handleDelete = async () => {
    if (!selected.length) return message.info('请选择文件');
    await handle(window.api.delete({ rootId: currentRootId!, targets: selected }));
    clearSelection();
    refresh();
  };

  const handleMoveOrCopy = (mode: 'move' | 'copy') => {
    if (!selected.length) return message.info('请选择文件');
    let destRef: any = null;
    Modal.confirm({
      title: mode === 'move' ? '移动到' : '复制到',
      content: (
        <Input
          placeholder="目标路径，例如 . 或 images"
          defaultValue="."
          ref={(ref) => (destRef = ref)}
        />
      ),
      onOk: async () => {
        const value = destRef?.input?.value?.trim() || '.';
        if (mode === 'move') {
          await handle(
            window.api.move({
              rootId: currentRootId!,
              targets: selected,
              destination: value
            })
          );
        } else {
          await handle(
            window.api.copy({
              rootId: currentRootId!,
              targets: selected,
              destination: value
            })
          );
        }
        clearSelection();
        refresh();
      }
    });
  };

  const handleSetLevel = (level: LevelTag) => {
    if (!selected.length) return message.info('请选择文件');
    window.api
      .setLevel({ rootId: currentRootId!, targets: selected, levelTag: level })
      .then((res) => {
        if (!res.ok) {
          message.error(res.message || '操作失败');
        } else {
          addMessage({
            type: 'success',
            title: '标签更新',
            message: '标签设置成功'
          });
          refresh();
        }
      });
  };

  const clearTemp = async () => {
    const tempPaths = files.filter((f) => f.levelTag === 'temp').map((f) => f.relativePath);
    if (!tempPaths.length) return message.info('没有临时文件');
    await handle(window.api.setLevel({ rootId: currentRootId!, targets: tempPaths, levelTag: null }));
    refresh();
  };

  const onOpen = async (file: FileEntry) => {
    if (file.isDirectory) {
      setCurrentPath(file.relativePath);
    } else {
      await window.api.openItem({ rootId: currentRootId!, relativePath: file.relativePath });
    }
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
  };

  const handlePathInputSubmit = () => {
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

    let relativePath = inputPath;
    if (inputPath.startsWith(root.path)) {
      relativePath = inputPath.slice(root.path.length).replace(/^[\/\\]/, '');
      if (relativePath === '') {
        relativePath = '.';
      }
    }

    setCurrentPath(relativePath);
    setPathInputMode(false);
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePathInputSubmit();
    } else if (e.key === 'Escape') {
      setPathInputMode(false);
    }
  };

  const handlePathInputFocus = () => {
    const root = roots.find((r) => r.id === currentRootId);
    const fullPath = currentPath === '.' ? root?.path || '' : `${root?.path || ''}/${currentPath}`;
    setPathInputValue(fullPath);
    setTimeout(() => pathInputRef.current?.select(), 0);
  };

  const handleGoBack = () => {
    if (currentPath === '.' || !currentPath) return;
    const pathParts = currentPath.split(/[\/]/).filter(Boolean);
    if (pathParts.length === 0) {
      setCurrentPath('.');
    } else {
      const parentPath = pathParts.slice(0, -1).join('/');
      setCurrentPath(parentPath || '.');
    }
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
    if (selected.includes(file.relativePath)) {
      setRenamingPath(file.relativePath);
    } else {
      selectSingle(file.relativePath);
    }
  };

  const handleRenameSubmit = async (file: FileEntry, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === file.name) {
      setRenamingPath(null);
      return;
    }
    try {
      await handle(
        window.api.rename({
          rootId: currentRootId!,
          relativePath: file.relativePath,
          name: trimmedName
        })
      );
      refresh();
    } catch (err) {
    } finally {
      setRenamingPath(null);
    }
  };

  const handleFileAreaMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.file-card') || target.closest('.list-item')) return;
    clearSelection();
    const rect = fileAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDragging(true);
  };

  const handleFileAreaMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const rect = fileAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const startX = dragStartRef.current.x;
    const startY = dragStartRef.current.y;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    setSelectionBox({ x, y, width, height });
    const selectedPaths: string[] = [];
    Object.entries(fileRefs.current).forEach(([path, el]) => {
      const elRect = el.getBoundingClientRect();
      const elX = elRect.left - rect.left;
      const elY = elRect.top - rect.top;
      const elRight = elX + elRect.width;
      const elBottom = elY + elRect.height;
      if (elX < x + width && elRight > x && elY < y + height && elBottom > y) {
        selectedPaths.push(path);
      }
    });
    setSelected(selectedPaths);
  };

  const handleFileAreaMouseUp = () => {
    setIsDragging(false);
    setSelectionBox(null);
    dragStartRef.current = null;
  };

  const breadcrumb = useMemo(() => {
    const root = roots.find((r) => r.id === currentRootId);
    const pathParts = currentPath.split(/[\/]/).filter(Boolean);
    const items: Array<{ title: string; path: string }> = [];
    
    if (root) {
      items.push({ title: root.name, path: '.' });
    }
    
    let currentPathAccum = '';
    pathParts.forEach((part, index) => {
      currentPathAccum = currentPathAccum ? `${currentPathAccum}/${part}` : part;
      items.push({ title: part, path: currentPathAccum });
    });
    
    return items;
  }, [currentPath, currentRootId, roots]);

  const operationsBusy = Object.keys(operationStatus).length > 0;

  const tabItems = tabs.map((tab) => ({
    key: tab.id,
    label: (
      <Space size={6}>
        <FolderOpenOutlined />
        <span>{tab.title}</span>
      </Space>
    ),
    closable: tabs.length > 1
  }));

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

  const handleMinimize = () => window.api.windowMinimize();
  const handleMaximize = () => window.api.windowToggleMaximize();
  const handleClose = () => window.api.windowClose();

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="tab-bar">
          <Tabs
            type="editable-card"
            items={tabItems}
            hideAdd
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              const target = tabs.find((t) => t.id === key);
              if (target) {
                setCurrentRootId(target.rootId);
                setCurrentPath(target.path);
              }
            }}
            onEdit={onEditTabs as any}
            tabBarExtraContent={
              <Button
                type="text"
                icon={<PlusTabOutlined />}
                onClick={addNewTab}
                style={{ paddingInline: 4 }}
              />
            }
          />
        </div>
        <div className="window-controls">
          <Flex gap={8}>
            <Button type="text" icon={<MinusOutlined />} onClick={handleMinimize} />
            <Button type="text" icon={<BorderOutlined />} onClick={handleMaximize} />
            <Button type="text" icon={<CloseOutlined />} danger onClick={handleClose} />
          </Flex>
        </div>
      </div>

      <div className="middle-bar">
        <Card size="small" className="search-card" variant="borderless" style={{ position: 'relative', zIndex: 999 }} >
          <Flex align="center" gap={8} style={{ flex: 1 }}>
            <Space className="navigation-buttons">
              <Tooltip title="返回上一级">
                <Button icon={<ArrowLeftOutlined />} onClick={handleGoBack} />
              </Tooltip>
              <Tooltip title="刷新">
                <Button icon={<ReloadOutlined />} onClick={refresh} />
              </Tooltip>
            </Space>
            <div className="path-bar-container">
              {pathInputMode ? (
                <Input
                  ref={pathInputRef}
                  value={pathInputValue}
                  onChange={(e) => setPathInputValue(e.target.value)}
                  onBlur={handlePathInputSubmit}
                  onKeyDown={handlePathInputKeyDown}
                  onFocus={handlePathInputFocus}
                  prefix={<FolderOpenOutlined />}
                  className="path-bar-input"
                  autoFocus
                />
              ) : (
                <div 
                  className="path-bar" 
                  onClick={() => setPathInputMode(true)}
                >
                  <Flex align="center" gap={8}>
                    <FolderOpenOutlined />
                    <Breadcrumb
                      items={breadcrumb.map((item, index) => ({
                        title: (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBreadcrumbClick(item.path);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {item.title}
                          </span>
                        )
                      }))}
                    />
                  </Flex>
                </div>
              )}
            </div>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索（UI 待接入）"
              allowClear
              className="search-bar"
            />
            <Button icon={<SwapOutlined rotate={90} />} onClick={() => setSearchOpen(!searchOpen)}>
              高级筛选
            </Button>
          </Flex>
          {searchOpen && (
            <Flex gap={8} style={{ marginTop: 8 }}>
              <Segmented
                options={levelTagOptions.map((o) => ({ label: o.label, value: o.key ?? 'none' }))}
                onChange={() => {}}
              />
              <Input placeholder="关键词" />
              <Input placeholder="扩展名" />
            </Flex>
          )}
        </Card>
      </div>

      <div className="content-area">
        <div className="sidebar">
          <SideBar
            roots={roots}
            currentRootId={currentRootId}
            onSelectRoot={(id) => setCurrentRootId(id)}
            onAddRoot={openAddRoot}
          />
        </div>

        <div className="file-area">
          <Card size="small" className="ribbon-card" variant="borderless">
            <Flex gap={12} wrap align="center">
              <Space>
                <Button icon={<FolderAddOutlined />} onClick={handleNewFolder}>
                  新建文件夹
                </Button>
                <Button icon={<CloudUploadOutlined />} onClick={handleUpload}>
                  上传
                </Button>
              </Space>
              <Space>
                <Button icon={<TagOutlined />} onClick={() => handleSetLevel('important')}>
                  标记重要
                </Button>
                <Button onClick={() => handleSetLevel('normal')}>标记常规</Button>
                <Button onClick={() => handleSetLevel('temp')}>标记临时</Button>
                <Button onClick={() => handleSetLevel(null)}>清除标签</Button>
              </Space>
              <Space>
                <Button icon={<ScissorOutlined />} onClick={() => handleMoveOrCopy('move')}>
                  剪切
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => handleMoveOrCopy('copy')}>
                  复制
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                  删除
                </Button>
              </Space>
              <Space>
                <Button onClick={() => setSelected(files.map((f) => f.relativePath))}>全选</Button>
                <Button onClick={clearSelection}>清空选择</Button>
                <Button onClick={clearTemp}>清空临时</Button>
              </Space>
              <Space className="view-switch">
                <Segmented
                  options={[
                    { label: '目录视图', value: 'physical', icon: <FolderOpenOutlined /> },
                    { label: '时间视图', value: 'time', icon: <ClockCircleOutlined /> }
                  ]}
                  value={viewMode}
                  onChange={(val) => setViewMode(val as ViewMode)}
                />
                <Tooltip title="列表视图">
                  <Button
                    icon={<UnorderedListOutlined />}
                    type={displayMode === 'list' ? 'primary' : 'default'}
                    onClick={() => setDisplayMode('list')}
                  />
                </Tooltip>
                <Tooltip title="缩略图视图">
                  <Button
                    icon={<AppstoreOutlined />}
                    type={displayMode === 'thumbnail' ? 'primary' : 'default'}
                    onClick={() => setDisplayMode('thumbnail')}
                  />
                </Tooltip>
                {operationsBusy && <Tag color="blue">处理中...</Tag>}
              </Space>
            </Flex>
          </Card>

          <div 
            className="file-display"
            ref={fileAreaRef}
            onMouseDown={handleFileAreaMouseDown}
            onMouseMove={handleFileAreaMouseMove}
            onMouseUp={handleFileAreaMouseUp}
            onMouseLeave={handleFileAreaMouseUp}
          >
            {selectionBox && (
              <div
                className="selection-box"
                style={{
                  position: 'absolute',
                  left: selectionBox.x,
                  top: selectionBox.y,
                  width: selectionBox.width,
                  height: selectionBox.height,
                  border: '1px dashed #1890ff',
                  backgroundColor: 'rgba(24, 144, 255, 0.1)',
                  pointerEvents: 'none',
                  zIndex: 1000
                }}
              />
            )}
            {loading ? (
              <Flex style={{ height: '100%' }} align="center" justify="center">
                <Spin />
              </Flex>
            ) : !currentRootId ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无根目录"
                style={{ marginTop: 80 }}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddRoot}>
                  添加根目录
                </Button>
              </Empty>
            ) : viewMode === 'time' ? (
              <TimeView buckets={timeBuckets} />
            ) : (
              <div className={displayMode === 'list' ? 'list-view' : 'grid-view'}>
                {files.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
                ) : displayMode === 'list' ? (
                  <>
                    <div className="list-header">
                      <div className="list-header-name">名称</div>
                      <div className="list-header-date">修改日期</div>
                      <div className="list-header-date">文件日期</div>
                      <div className="list-header-level">等级</div>
                    </div>
                    {files.map((file) => (
                      <div
                        key={file.relativePath}
                        ref={(el) => { if (el) fileRefs.current[file.relativePath] = el; }}
                        className={`list-item ${selected.includes(file.relativePath) ? 'selected' : ''}`}
                        onClick={(e) => handleFileClick(e, file)}
                        onDoubleClick={() => onOpen(file)}
                      >
                        <div className="list-item-name">
                          <Flex align="center" gap={8}>
                            {file.isDirectory ? <FolderOpenOutlined /> : <FileIcon ext={file.ext} />}
                            {renamingPath === file.relativePath ? (
                              <Input
                                defaultValue={file.name}
                                autoFocus
                                onBlur={(e) => handleRenameSubmit(file, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameSubmit(file, (e.target as HTMLInputElement).value);
                                  } else if (e.key === 'Escape') {
                                    setRenamingPath(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ flex: 1 }}
                              />
                            ) : (
                              <span onClick={(e) => handleFileNameClick(e, file)}>{file.name}</span>
                            )}
                          </Flex>
                        </div>
                        <div className="list-item-date">{formatTime(file.modified)}</div>
                        <div className="list-item-date">{file.customTime ? formatTime(Date.parse(file.customTime)) : '-'}</div>
                        <div className="list-item-level">
                          <Tag color={levelTagMeta(file.levelTag).color}>
                            {levelTagMeta(file.levelTag).label}
                          </Tag>
                          {operationStatus[file.fullPath] && (
                            <Tag color="processing" style={{ marginLeft: 8 }}>
                              {operationStatus[file.fullPath].operation}...
                            </Tag>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  files.map((file) => (
                    <Card
                      key={file.relativePath}
                      size="small"
                      ref={(el) => { if (el) fileRefs.current[file.relativePath] = el; }}
                      className={`file-card ${
                        selected.includes(file.relativePath) ? 'selected' : ''
                      }`}
                      onClick={(e) => handleFileClick(e, file)}
                      onDoubleClick={() => onOpen(file)}
                      extra={
                        <Tag color={levelTagMeta(file.levelTag).color}>
                          {levelTagMeta(file.levelTag).label}
                        </Tag>
                      }
                    >
                      <Flex align="center" gap={8}>
                        {file.isDirectory ? <FolderOpenOutlined /> : <FileIcon ext={file.ext} />}
                        <div style={{ flex: 1 }}>
                          {renamingPath === file.relativePath ? (
                            <Input
                              defaultValue={file.name}
                              autoFocus
                              onBlur={(e) => handleRenameSubmit(file, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleRenameSubmit(file, (e.target as HTMLInputElement).value);
                                } else if (e.key === 'Escape') {
                                  setRenamingPath(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '100%' }}
                            />
                          ) : (
                            <div className="name" onClick={(e) => handleFileNameClick(e, file)}>{file.name}</div>
                          )}
                          <div className="meta">
                            {file.isDirectory ? '文件夹' : formatSize(file.size)} ·{' '}
                            {formatTime(file.customTime ? Date.parse(file.customTime) : file.created)}
                          </div>
                        </div>
                        {operationStatus[file.fullPath] && (
                          <Tag color="processing">
                            {operationStatus[file.fullPath].operation}...
                          </Tag>
                        )}
                      </Flex>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <MessageHub />
    </div>
  );
};

const FileIcon: React.FC<{ ext: string }> = ({ ext }) => {
  if (!ext) return <FileOutlined />;
  return (
    <Tooltip title={ext.toUpperCase()}>
      <FileOutlined />
    </Tooltip>
  );
};

export default App;