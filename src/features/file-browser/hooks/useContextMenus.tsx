import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CopyOutlined,
  DeleteOutlined,
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
import { useStore } from '@/store/useStore';
import { useApiHelpers } from './useApiHelpers';

interface ContextMenuParams {
  currentRootId: string | null;
  selected: string[];
  onOpen: (file: FileEntry) => void;
  handleCopyOrCut: (mode: 'copy' | 'cut', paths?: string[]) => void;
  handlePaste: () => Promise<void>;
  handleCleanTemp: (paths?: string[]) => Promise<void>;
  handleSetCustomTime: (targets: string[]) => void;
  handleSetLevelForPaths: (level: LevelTag, targets: string[]) => void;
  setRenamingPath: (path: string | null) => void;
  handleNewFolder: () => void;
  promptNewFile: () => void;
  handleCleanTempRoot: () => Promise<void>;
}

export const useContextMenus = ({
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
  handleCleanTempRoot
}: ContextMenuParams) => {
  const { clearSelection, selectSingle } = useStore();
  const { handle } = useApiHelpers();

  const [menuState, setMenuState] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    type: 'single-file' | 'multi-file' | 'blank';
    target?: FileEntry | null;
  }>({ visible: false, position: { x: 0, y: 0 }, type: 'blank', target: null });

  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([]);
  const [openWithLoading, setOpenWithLoading] = useState(false);
  const [openWithExpanded, setOpenWithExpanded] = useState(false);

  const closeContextMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
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
  }, [handle, menuState.target, menuState.type, menuState.visible]);

  useEffect(() => {
    if (!menuState.visible) setOpenWithExpanded(false);
  }, [menuState.visible]);

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, file: FileEntry) => {
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
    },
    [selectSingle, selected]
  );

  const handleBlankContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      setMenuState({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        type: 'blank',
        target: null
      });
    },
    [clearSelection]
  );

  const openWithVisibleApps = useMemo(() => {
    const limit = 5;
    if (openWithExpanded || openWithApps.length <= limit) return openWithApps;
    return openWithApps.slice(0, limit);
  }, [openWithApps, openWithExpanded]);

  const newMenuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'new-folder',
        label: '文件夹',
        icon: <FolderAddOutlined />,
        onClick: () => {
          closeContextMenu();
          handleNewFolder();
        }
      },
      {
        key: 'new-file',
        label: '文件',
        icon: <FileTextOutlined />,
        onClick: () => {
          closeContextMenu();
          promptNewFile();
        }
      }
    ],
    [closeContextMenu, handleNewFolder, promptNewFile]
  );

  const levelMenu = useCallback(
    (paths: string[]): MenuProps['items'] => [
      {
        key: 'level-important',
        label: '重要',
        onClick: () => handleSetLevelForPaths('important', paths)
      },
      {
        key: 'level-normal',
        label: '普通',
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
    ],
    [handleSetLevelForPaths]
  );

  const timeItem = useCallback(
    (paths: string[]) => ({
      key: 'custom-time',
      label: '设置时间',
      icon: <FieldTimeOutlined />,
      onClick: () => handleSetCustomTime(paths)
    }),
    [handleSetCustomTime]
  );

  const openWithItems = useMemo<MenuProps['items']>(() => {
    if (!menuState.target) return [];
    return [
      ...(openWithLoading
        ? [
            {
              key: 'open-loading',
              label: '正在读取关联程序...',
              disabled: true
            }
          ]
        : openWithApps.length
          ? [
              ...openWithVisibleApps.map((app) => {
                const tag = app.isDefault ? ' (默认)' : app.lastUsed ? ' (最近使用)' : '';
                return {
                  key: app.name || app.command,
                  icon: <AppIcon path={app.iconPath} size="small" />,
                  label: `${app.displayName || app.name}${tag}`,
                  onClick: () => {
                    closeContextMenu();
                    return handle(
                      window.api.openWithApp({
                        command: app.command,
                        filePath: menuState.target!.fullPath,
                        name: app.name,
                        displayName: app.displayName,
                        iconPath: app.iconPath
                      })
                    );
                  }
                };
              }),
              ...(openWithApps.length > openWithVisibleApps.length
                ? [
                    {
                      key: 'open-more',
                      icon: <AppstoreOutlined />,
                      label: '显示更多...',
                      closeOnClick: false,
                      onClick: (e: any) => {
                        e?.domEvent?.preventDefault?.();
                        e?.domEvent?.stopPropagation?.();
                        setOpenWithExpanded(true);
                      }
                    } as any
                  ]
                : [])
            ]
          : [
              {
                key: 'open-none',
                label: '未检索到关联程序',
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
    ];
  }, [closeContextMenu, currentRootId, handle, menuState.target, openWithApps, openWithLoading, openWithVisibleApps]);

  const menuItems = useMemo<MenuProps['items']>(() => {
    const pasteItem = {
      key: 'paste',
      label: '粘贴',
      icon: <SnippetsOutlined />,
      disabled: !currentRootId,
      onClick: handlePaste
    };

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
          key: 'clean-temp',
          label: '清理临时内容',
          icon: <DeleteOutlined />,
          onClick: () => handleCleanTemp([menuState.target!.relativePath])
        },
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
        {
          key: 'level',
          label: '设置等级',
          icon: <TagOutlined />,
          children: levelMenu([menuState.target.relativePath])
        },
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
        {
          key: 'clean-temp',
          label: '清理临时内容',
          icon: <DeleteOutlined />,
          onClick: () => handleCleanTemp(selected)
        },
        timeItem(selected),
        {
          key: 'level',
          label: '设置等级',
          icon: <TagOutlined />,
          children: levelMenu(selected)
        }
      ];
    }

    if (menuState.type === 'blank') {
      return [
        pasteItem,
        {
          key: 'clean-temp',
          label: '清理当前目录的临时内容',
          icon: <DeleteOutlined />,
          onClick: handleCleanTempRoot
        },
        {
          key: 'new',
          label: '新建',
          icon: <FileAddOutlined />,
          children: newMenuItems
        }
      ];
    }

    return [];
  }, [
    closeContextMenu,
    currentRootId,
    handleCleanTemp,
    handleCleanTempRoot,
    handleCopyOrCut,
    handlePaste,
    levelMenu,
    menuState,
    newMenuItems,
    onOpen,
    openWithItems,
    selected,
    setRenamingPath,
    timeItem
  ]);

  return {
    menuState,
    setMenuState,
    closeContextMenu,
    menuItems,
    handleFileContextMenu,
    handleBlankContextMenu,
    openWithExpanded,
    setOpenWithExpanded
  };
};
