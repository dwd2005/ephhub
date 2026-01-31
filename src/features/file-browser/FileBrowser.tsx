import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Input, Modal, Space, DatePicker } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CopyOutlined,
  EditOutlined,
  FieldTimeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  TagOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useStore } from '@/store/useStore';
import SideBar from '@/components/SideBar';
import MessageHub from '@/components/MessageHub';
import ContextMenu from '@/components/ContextMenu';
import { useApiHelpers } from './hooks/useApiHelpers';
import TopBar from './components/TopBar';
import PathSearchBar from './components/PathSearchBar';
import ActionRibbon from './components/ActionRibbon';
import FileDisplay from './components/FileDisplay';
import type { NewFileType } from '@/types/newFile';
import './file-browser.css';

const levelTagOptions: { key: LevelTag; label: string }[] = [
  { key: 'important', label: '重要' },
  { key: 'normal', label: '常规' },
  { key: 'temp', label: '临时' },
  { key: null, label: '全部' }
];

const FileBrowser: React.FC = () => {
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
    setIsDragging,
    clipboard,
    setClipboard
  } = useStore();

  const [activeTab, setActiveTab] = useState<string>('');
  const { message, modal } = AntApp.useApp();
  const { handle } = useApiHelpers();
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pathInputMode, setPathInputMode] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const pathInputRef = useRef<any>(null);
  const fileAreaRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);
  const [openWithLoading, setOpenWithLoading] = useState(false);
  const [newFileTypes, setNewFileTypes] = useState<NewFileType[]>([]);
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    type: 'single-file' | 'multi-file' | 'blank';
    target?: FileEntry | null;
  }>({ visible: false, position: { x: 0, y: 0 }, type: 'blank', target: null });

  const closeContextMenu = () => setMenuState((prev) => ({ ...prev, visible: false }));

  const deriveTitle = (rootId: string | null, path: string) => {
    const root = roots.find((r) => r.id === rootId);
    if (!path || path === '.') return root?.name || '未命名';
    const parts = path.split(/[\\/]/).filter(Boolean);
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
  }, [currentPath, currentRootId, activeTab, updateTab]);

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
  }, []);

  useEffect(() => {
    const fetchOpenWith = async () => {
      if (!menuState.visible || menuState.type !== 'single-file' || !menuState.target) return;
      setOpenWithLoading(true);
      try {
        const apps = await handle(
          window.api.getOpenWithApps({ filePath: menuState.target.fullPath })
        );
        setOpenWithApps(apps);
      } catch (err) {
        setOpenWithApps([]);
      } finally {
        setOpenWithLoading(false);
      }
    };
    fetchOpenWith();
  }, [menuState.visible, menuState.type, menuState.target, handle]);

  useEffect(() => {
    const loadNewFileTypes = async () => {
      try {
        const list = await handle(window.api.getNewFileTypes());
        setNewFileTypes(list);
      } catch (err) {
        setNewFileTypes([]);
      }
    };
    loadNewFileTypes();
  }, [handle]);

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
    const name = picked.split(/[\\/]/).pop() || picked;
    const newRoot = await handle(window.api.addRoot({ name, path: picked }));
    setRoots([...roots, newRoot], newRoot.id);
  };

  const handleNewFolder = () => {
    let inputRef: any = null;
    modal.confirm({
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
    modal.confirm({
      title: mode === 'move' ? '移动到' : '复制到',
      content: (
        <Input
          placeholder="目标路径，如 . 或 images"
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

  const handleCopyOrCut = (mode: 'copy' | 'cut', paths?: string[]) => {
    if (!currentRootId) {
      message.info('请先选择根目录');
      return;
    }
    const targets = paths ?? selected;
    if (!targets.length) return message.info('请先选择文件');
    setClipboard({ mode, rootId: currentRootId, paths: targets });
    closeContextMenu();
    message.success(mode === 'copy' ? '已加入复制队列' : '已加入剪切队列');
  };

  const handlePaste = async () => {
    closeContextMenu();
    if (!clipboard) return message.info('剪贴板为空');
    if (!currentRootId) return message.info('请先选择根目录');
    if (clipboard.rootId !== currentRootId) {
      return message.warning('只能在同一根目录中粘贴');
    }
    try {
      if (clipboard.mode === 'copy') {
        await handle(
          window.api.copy({
            rootId: currentRootId,
            targets: clipboard.paths,
            destination: currentPath
          })
        );
        message.success('粘贴完成');
      } else {
        await handle(
          window.api.move({
            rootId: currentRootId,
            targets: clipboard.paths,
            destination: currentPath
          })
        );
        setClipboard(null);
        message.success('移动完成');
      }
      clearSelection();
      refresh();
    } catch (err) {}
  };

  const handleFileContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const alreadySelected = selected.includes(file.relativePath);
    if (!alreadySelected) {
      selectSingle(file.relativePath);
    }
    const selectionSize = alreadySelected ? selected.length : 1;
    setMenuState({
      visible: true,
      position: { x: e.clientX, y: e.clientY },
      type: selectionSize > 1 ? 'multi-file' : 'single-file',
      target: file
    });
  };

  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    setMenuState({
      visible: true,
      position: { x: e.clientX, y: e.clientY },
      type: 'blank',
      target: null
    });
  };

  const promptNewFile = (options: { ext: string; placeholder: string; templatePath?: string | null }) => {
    closeContextMenu();
    let inputRef: any = null;
    modal.confirm({
      title: `新建${options.placeholder}`,
      content: (
        <Input
          defaultValue={`新建${options.placeholder}${options.ext}`}
          ref={(ref) => (inputRef = ref)}
          placeholder="请输入文件名"
        />
      ),
      onOk: async () => {
        const value = inputRef?.input?.value?.trim();
        if (!value) return Promise.reject();
        const finalName = value.endsWith(options.ext) ? value : `${value}${options.ext}`;
        await handle(
          window.api.createFile({
            rootId: currentRootId!,
            relativePath: currentPath,
            name: finalName,
            content: '',
            templatePath: options.templatePath || undefined
          })
        );
        refresh();
      }
    });
  };

  const handleSetLevel = (level: LevelTag) => {
    if (!selected.length) return message.info('请选择文件');
    handleSetLevelForPaths(level, selected);
  };

  const handleSetLevelForPaths = (level: LevelTag, targets: string[]) => {
    if (!currentRootId) {
      message.info('请先选择根目录');
      return;
    }
    if (!targets.length) return;
    window.api
      .setLevel({ rootId: currentRootId!, targets, levelTag: level })
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
    if (!currentRootId) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: '清空临时级别文件',
        content: '将删除所有标记为"临时"的文件/文件夹并移入回收站，确认继续？',
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    if (!confirmed) return;
    await handle(window.api.deleteByLevel({ rootId: currentRootId, levelTag: 'temp' }));
    refresh();
  };

  const handleSetCustomTime = (targets: string[]) => {
    if (!currentRootId) {
      message.info('请先选择根目录');
      return;
    }
    if (!targets.length) return;
    let picked: Dayjs | null = dayjs();
    modal.confirm({
      title: '设置自定义时间',
      content: (
        <DatePicker
          showTime
          defaultValue={picked}
          style={{ width: '100%' }}
          onChange={(val) => {
            picked = val;
          }}
        />
      ),
      onOk: async () => {
        if (!picked) return Promise.reject();
        await handle(
          window.api.setCustomTime({
            rootId: currentRootId!,
            targets,
            customTime: picked.toISOString()
          })
        );
        refresh();
      }
    });
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
      relativePath = inputPath.slice(root.path.length).replace(/^[\\/]/, '');
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
    const pathParts = currentPath.split(/[\\/]/).filter(Boolean);
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

  const operationsBusy = Object.keys(operationStatus).length > 0;

  const openWithItems: MenuProps['items'] = menuState.target
    ? [
        {
          key: 'open-default',
          label: '默认程序',
          onClick: () => {
            closeContextMenu();
            onOpen(menuState.target!);
          }
        },
        ...(openWithLoading
          ? [
              {
                key: 'open-loading',
                label: '正在读取关联程序...',
                disabled: true
              }
            ]
          : openWithApps.length
            ? openWithApps.map((app) => {
                const iconPath = app.iconPath;
                const isDllIcon = iconPath && iconPath.includes('.dll');
                const isValidIcon = iconPath && !isDllIcon;
                return {
                  key: app.name,
                  icon: isValidIcon ? (
                    <AppstoreOutlined />
                  ) : (
                    <AppstoreOutlined />
                  ),
                  label: app.displayName || app.name,
                  onClick: () => {
                    closeContextMenu();
                    return handle(
                      window.api.openWithApp({
                        command: app.command,
                        filePath: menuState.target!.fullPath
                      })
                    );
                  }
                };
              })
            : [
                {
                  key: 'open-none',
                  label: '未检测到关联程序',
                  disabled: true
                }
              ]),
        { type: 'divider' as const },
        {
          key: 'open-with-dialog',
          label: '选择其他应用',
          icon: <AppstoreOutlined />,
          onClick: async () => {
            closeContextMenu();
            return handle(
              window.api.openWithDialog({
                filePath: menuState.target!.fullPath
              })
            );
          }
        },
        { type: 'divider' as const },
        {
          key: 'reveal',
          label: '在资源管理器中显示',
          onClick: () => {
            closeContextMenu();
            return handle(
              window.api.revealItem({
                rootId: currentRootId!,
                relativePath: menuState.target!.relativePath
              })
            );
          }
        }
      ]
    : [];

  const newMenuItems: MenuProps['items'] = [
    {
      key: 'new-folder',
      label: '文件夹',
      icon: <FolderAddOutlined />,
      onClick: () => {
        closeContextMenu();
        handleNewFolder();
      }
    },
    ...(newFileTypes.length
      ? newFileTypes.map((type) => {
          const iconPath = type.iconPath;
          const isDllIcon = iconPath && iconPath.includes('.dll');
          const isValidIcon = iconPath && !isDllIcon;
          return {
            key: `new-${type.extension}`,
            label: type.name || `新建${type.extension}`,
            icon: isValidIcon ? (
              <FileTextOutlined />
            ) : (
              <FileTextOutlined />
            ),
            onClick: () =>
              promptNewFile({
                ext: type.extension,
                placeholder: type.name || type.extension,
                templatePath: type.templatePath || undefined
              })
          };
        })
      : [
          {
            key: 'new-text',
            label: '文本文档',
            icon: <FileTextOutlined />,
            onClick: () =>
              promptNewFile({
                ext: '.txt',
                placeholder: '文本文档'
              })
          }
        ])
  ];

  const menuItems: MenuProps['items'] = (() => {
    const pasteItem = {
      key: 'paste',
      label: '粘贴',
      icon: <SnippetsOutlined />,
      disabled: !clipboard || !currentRootId || clipboard.rootId !== currentRootId,
      onClick: handlePaste
    };

    const timeItem = (paths: string[]) => ({
      key: 'custom-time',
      label: '设置时间',
      icon: <FieldTimeOutlined />,
      onClick: () => handleSetCustomTime(paths)
    });

    const levelMenu = (paths: string[]) => ({
      key: 'level',
      label: '设置等级',
      icon: <TagOutlined />,
      children: [
        {
          key: 'level-important',
          label: '重要',
          onClick: () => handleSetLevelForPaths('important', paths)
        },
        {
          key: 'level-normal',
          label: '常规',
          onClick: () => handleSetLevelForPaths('normal', paths)
        },
        {
          key: 'level-temp',
          label: '临时',
          onClick: () => handleSetLevelForPaths('temp', paths)
        },
        {
          key: 'level-clear',
          label: '清除等级',
          onClick: () => handleSetLevelForPaths(null, paths)
        }
      ]
    });

    if (menuState.type === 'single-file' && menuState.target) {
      return [
        {
          key: 'open',
          label: '打开',
          icon: <FolderOpenOutlined />,
          onClick: () => {
            closeContextMenu();
            onOpen(menuState.target!);
          }
        },
        { type: 'divider' as const },
        {
          key: 'cut',
          label: '剪切',
          icon: <ScissorOutlined />,
          onClick: () => handleCopyOrCut('cut', [menuState.target!.relativePath])
        },
        {
          key: 'copy',
          label: '复制',
          icon: <CopyOutlined />,
          onClick: () => handleCopyOrCut('copy', [menuState.target!.relativePath])
        },
        pasteItem,
        { type: 'divider' as const },
        {
          key: 'rename',
          label: '重命名',
          icon: <EditOutlined />,
          onClick: () => {
            closeContextMenu();
            setRenamingPath(menuState.target!.relativePath);
          }
        },
        timeItem([menuState.target.relativePath]),
        levelMenu([menuState.target.relativePath]),
        { type: 'divider' as const },
        {
          key: 'open-with',
          label: '打开方式',
          icon: <AppstoreOutlined />,
          children: openWithItems.length
            ? openWithItems
            : [
                {
                  key: 'open-default-only',
                  label: '默认程序',
                  onClick: () => {
                    closeContextMenu();
                    onOpen(menuState.target!);
                  }
                }
              ]
        }
      ];
    }

    if (menuState.type === 'multi-file') {
      return [
        {
          key: 'cut',
          label: '剪切',
          icon: <ScissorOutlined />,
          onClick: () => handleCopyOrCut('cut')
        },
        {
          key: 'copy',
          label: '复制',
          icon: <CopyOutlined />,
          onClick: () => handleCopyOrCut('copy')
        },
        timeItem(selected),
        levelMenu(selected)
      ];
    }

    if (menuState.type === 'blank') {
      return [
        pasteItem,
        {
          key: 'new',
          label: '新建',
          icon: <FileAddOutlined />,
          children: newMenuItems
        }
      ];
    }

    return [];
  })();

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
        onAddTab={addNewTab}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
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
      />

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
          <ActionRibbon
            onNewFolder={handleNewFolder}
            onUpload={handleUpload}
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
            onFileAreaMouseDown={handleFileAreaMouseDown}
            onFileAreaMouseMove={handleFileAreaMouseMove}
            onFileAreaMouseUp={handleFileAreaMouseUp}
            onBlankContextMenu={handleBlankContextMenu}
            onFileClick={handleFileClick}
            onFileContextMenu={handleFileContextMenu}
            onFileNameClick={handleFileNameClick}
            onRenameSubmit={handleRenameSubmit}
            onOpen={onOpen}
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
