import React, { useEffect, useMemo, useState } from 'react';
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
  Space
} from 'antd';
import {
  AppstoreOutlined,
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
    updateTab
  } = useStore();
  const [activeTab, setActiveTab] = useState<string>('');

  const { message } = AntApp.useApp();
  const { handle } = useApiHelpers();
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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

  const breadcrumb = useMemo(() => currentPath.split(/[\/]/).filter(Boolean), [currentPath]);
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
          <Flex align="center" gap={8}>
            <Input
              prefix={<FolderOpenOutlined />}
              value={breadcrumb.join('/') || '.'}
              readOnly
              className="path-bar"
            />
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
                <Button onClick={refresh} icon={<ReloadOutlined />}>
                  刷新
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

          <div className="file-display">
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
                ) : (
                  files.map((file) => (
                    <Card
                      key={file.relativePath}
                      size="small"
                      className={`file-card ${
                        selected.includes(file.relativePath) ? 'selected' : ''
                      }`}
                      onClick={() => toggleSelect(file.relativePath)}
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
                          <div className="name">{file.name}</div>
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
