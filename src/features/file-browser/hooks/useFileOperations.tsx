import { useCallback } from 'react';
import { App, DatePicker, Input } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useStore } from '@/store/useStore';
import { useApiHelpers } from './useApiHelpers';

interface UseFileOperationsParams {
  roots: Root[];
  currentRootId: string | null;
  currentPath: string;
  setCurrentPath: (path: string) => void;
  viewMode: ViewMode;
  refresh: () => Promise<void>;
}

export const useFileOperations = ({
  roots,
  currentRootId,
  currentPath,
  setCurrentPath,
  viewMode,
  refresh
}: UseFileOperationsParams) => {
  const {
    setRoots,
    clearSelection,
    setFiles,
    setSelected,
    addMessage,
    setClipboard,
    clipboard,
    setRenamingPath
  } = useStore();
  const { message, modal } = App.useApp();
  const { handle } = useApiHelpers();

  const openAddRoot = useCallback(async () => {
    const picked = await handle<string | null>(window.api.chooseRoot());
    if (!picked) return;
    const name = picked.split(/[\\/]/).pop() || picked;
    const newRoot = await handle(window.api.addRoot({ name, path: picked }));
    setRoots([...roots, newRoot], newRoot.id);
  }, [handle, roots, setRoots]);

  const handleNewFolder = useCallback(() => {
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
  }, [currentPath, currentRootId, handle, modal, refresh]);

  const handleRemoveRoot = useCallback(
    (id: string) => {
      if (!roots.find((r) => r.id === id)) return;
      modal.confirm({
        title: '移除根目录',
        content: '只会移除列表与元数据，不会删除磁盘文件，确认移除该根目录吗？',
        okType: 'danger',
        onOk: async () => {
          await handle(window.api.removeRoot({ id }));
          const nextRoots = roots.filter((r) => r.id !== id);
          setRoots(nextRoots, nextRoots[0]?.id || null);
          clearSelection();
          setCurrentPath('.');
        }
      });
    },
    [clearSelection, handle, modal, roots, setCurrentPath, setRoots]
  );

  const handleDelete = useCallback(async () => {
    const state = useStore.getState();
    if (!state.selected.length) return message.info('请选择文件');
    await handle(window.api.delete({ rootId: state.currentRootId!, targets: state.selected }));
    clearSelection();
    refresh();
  }, [clearSelection, handle, message, refresh]);

  const handleMoveOrCopy = useCallback(
    (mode: 'move' | 'copy') => {
      const state = useStore.getState();
      if (!state.selected.length) return message.info('请选择文件');
      let destRef: any = null;
      modal.confirm({
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
                rootId: state.currentRootId!,
                targets: state.selected,
                destination: value
              })
            );
          } else {
            await handle(
              window.api.copy({
                rootId: state.currentRootId!,
                targets: state.selected,
                destination: value
              })
            );
          }
          clearSelection();
          refresh();
        }
      });
    },
    [clearSelection, handle, message, modal, refresh]
  );

  const handleCopyOrCut = useCallback(
    (mode: 'copy' | 'cut', paths?: string[]) => {
      const state = useStore.getState();
      if (!state.currentRootId) {
        message.info('请先选择根目录');
        return;
      }
      const targets = paths ?? state.selected;
      if (!targets.length) return message.info('请先选择文件');
      setClipboard({ mode, rootId: state.currentRootId, paths: targets });
      message.success(mode === 'copy' ? '已加入复制队列' : '已加入剪切队列');
    },
    [message, setClipboard]
  );

  const handlePaste = useCallback(async () => {
    const state = useStore.getState();
    if (!state.currentRootId) return message.info('请先选择根目录');
    if (clipboard) {
      if (clipboard.rootId !== state.currentRootId) {
        return message.warning('只能在同一根目录中粘贴');
      }
      try {
        if (clipboard.mode === 'copy') {
          await handle(
            window.api.copy({
              rootId: state.currentRootId,
              targets: clipboard.paths,
              destination: state.currentPath
            })
          );
          message.success('粘贴完成');
        } else {
          await handle(
            window.api.move({
              rootId: state.currentRootId,
              targets: clipboard.paths,
              destination: state.currentPath
            })
          );
          setClipboard(null);
          message.success('移动完成');
        }
        clearSelection();
        refresh();
        return;
      } catch (err) {}
    }

    try {
      const external = await handle<string[]>(window.api.getClipboardFiles());
      if (!external?.length) return message.info('剪贴板中没有可粘贴的文件');
      await handle(
        window.api.pasteFromClipboard({ rootId: state.currentRootId!, relativePath: state.currentPath })
      );
      message.success('粘贴完成');
      clearSelection();
      refresh();
    } catch (err) {}
  }, [clearSelection, clipboard, handle, message, refresh, setClipboard]);

  const handleSetLevelForPaths = useCallback(
    (level: LevelTag, targets: string[]) => {
      const state = useStore.getState();
      if (!state.currentRootId) {
        message.info('请先选择根目录');
        return;
      }
      if (!targets.length) return;
      window.api
        .setLevel({ rootId: state.currentRootId!, targets, levelTag: level })
        .then((res) => {
          if (!res.ok) {
            message.error(res.message || '操作失败');
          } else {
            addMessage({ type: 'success', title: '标签更新', message: '标签设置成功' });
            refresh();
          }
        });
    },
    [addMessage, message, refresh]
  );

  const handleSetLevel = useCallback(
    (level: LevelTag) => {
      const state = useStore.getState();
      if (!state.selected.length) return message.info('请选择文件');
      handleSetLevelForPaths(level, state.selected);
    },
    [handleSetLevelForPaths, message]
  );

  const clearTemp = useCallback(async () => {
    const state = useStore.getState();
    if (!state.currentRootId) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: '清空“临时”等级文件',
        content: '将删除所有标记为“临时”的文件/文件夹并移入回收站，确认继续吗？',
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
    if (!confirmed) return;
    await handle(window.api.deleteByLevel({ rootId: state.currentRootId, levelTag: 'temp' }));
    refresh();
  }, [handle, modal, refresh]);

  const handleCleanTemp = useCallback(
    async (paths?: string[]) => {
      const state = useStore.getState();
      if (!state.currentRootId) return message.info('请先选择根目录');
      await handle(
        window.api.cleanTemp({
          rootId: state.currentRootId,
          targets: paths && paths.length ? paths : undefined,
          basePath: state.currentPath
        })
      );
      message.success('临时内容已清理');
      refresh();
    },
    [handle, message, refresh]
  );

  const handleSetCustomTime = useCallback(
    (targets: string[]) => {
      const state = useStore.getState();
      if (!state.currentRootId) {
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
            defaultValue={picked as any}
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
              rootId: state.currentRootId!,
              targets,
              customTime: picked.toISOString()
            })
          );
          refresh();
        }
      });
    },
    [handle, message, modal, refresh]
  );

  const onOpen = useCallback(
    async (file: FileEntry) => {
      const state = useStore.getState();
      if (file.isDirectory) {
        setCurrentPath(file.relativePath);
      } else {
        await window.api.openItem({ rootId: state.currentRootId!, relativePath: file.relativePath });
      }
    },
    [setCurrentPath]
  );

  const handleRenameSubmit = useCallback(
    async (file: FileEntry, newName: string) => {
      const trimmedName = newName.trim();
      if (!trimmedName || trimmedName === file.name) {
        setRenamingPath(null);
        return;
      }

      const getExt = (name: string) => {
        const idx = name.lastIndexOf('.');
        return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
      };
      const oldExt = getExt(file.name);
      const newExt = getExt(trimmedName);

      const doRename = async () => {
        try {
          await handle(
            window.api.rename({
              rootId: currentRootId!,
              relativePath: file.relativePath,
              name: trimmedName
            })
          );
          if (viewMode === 'time') {
            refresh();
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.relativePath === file.relativePath
                  ? {
                      ...f,
                      name: trimmedName,
                      ext: getExt(trimmedName),
                      fullPath: f.fullPath.replace(/[^\\/]+$/, trimmedName),
                      relativePath: f.relativePath.replace(/[^\\/]+$/, trimmedName)
                    }
                  : f
              )
            );
            setSelected((prev) =>
              prev.map((p) => (p === file.relativePath ? p.replace(/[^\\/]+$/, trimmedName) : p))
            );
          }
        } catch (err) {
        } finally {
          setRenamingPath(null);
        }
      };

      if (oldExt !== newExt) {
        modal.confirm({
          title: '确认修改扩展名？',
          content: `将把文件扩展名从 .${oldExt || '(无)'} 改为 .${newExt || '(无)'}`,
          okType: 'danger',
          onOk: () => doRename(),
          onCancel: () => setRenamingPath(null)
        });
        return;
      }

      await doRename();
    },
    [currentRootId, handle, modal, refresh, setFiles, setRenamingPath, setSelected, viewMode]
  );

  const promptNewFile = useCallback(
    (options: { ext: string; placeholder: string; templatePath?: string | null; data?: string | null }) => {
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
              templatePath: options.templatePath || undefined,
              data: options.data || undefined
            })
          );
          refresh();
        }
      });
    },
    [currentPath, currentRootId, handle, modal, refresh]
  );

  return {
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
  };
};

