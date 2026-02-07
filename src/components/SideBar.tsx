import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Flex, List, Typography, Tree, Empty, Dropdown } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  HomeOutlined,
  ClockCircleOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useApiHelpers } from '@/features/file-browser/hooks/useApiHelpers';

type Props = {
  roots: RootItem[];
  currentRootId: string | null;
  onSelectRoot: (id: string) => void;
  onAddRoot: () => void;
  onRemoveRoot: (id: string) => void;
  onSelectPath: (path: string) => void;
  currentPath: string;
  treeRefreshKey: number;
};

type TreeNode = DataNode & { path: string };

const SideBar: React.FC<Props> = ({
  roots,
  currentRootId,
  onSelectRoot,
  onAddRoot,
  onRemoveRoot,
  onSelectPath,
  currentPath,
  treeRefreshKey
}) => {
  const { handle } = useApiHelpers();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [treePaneHeight, setTreePaneHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef({ startY: 0, startHeight: 320 });
  const minTreeHeight = 180;
  const minRootHeight = 140;
  const splitterSize = 8;

  const currentRoot = useMemo(
    () => roots.find((r) => r.id === currentRootId) || null,
    [roots, currentRootId]
  );

  const buildRootNode = () =>
    currentRoot
      ? [
          {
            title: currentRoot.name,
            key: `root-${currentRoot.id}`,
            icon: <FolderOpenOutlined />,
            path: '.',
            isLeaf: false
          } as TreeNode
        ]
      : [];

  useEffect(() => {
    setTreeData(buildRootNode());
  }, [currentRootId, treeRefreshKey]);

  const replaceNode = (nodes: TreeNode[], targetKey: React.Key, children: TreeNode[]): TreeNode[] =>
    nodes.map((n) => {
      if (n.key === targetKey) return { ...n, children };
      if (n.children) return { ...n, children: replaceNode(n.children as TreeNode[], targetKey, children) };
      return n;
    });

  const loadDirChildren = async (node: TreeNode) => {
    if (!currentRoot) return;
    const list = await handle(
      window.api.list({ rootId: currentRoot.id, relativePath: node.path }),
      { onRetry: () => loadDirChildren(node) }
    );
    const dirs = list.filter((f) => f.isDirectory);
    const children: TreeNode[] = dirs.map((d) => ({
      title: d.name,
      key: `${node.key}/${d.name}`,
      icon: <FolderOpenOutlined />,
      path: d.relativePath,
      isLeaf: false
    }));
    setTreeData((prev) => replaceNode(prev, node.key, children));
  };

  const selectedKey = useMemo(() => {
    if (!currentRoot) return [] as React.Key[];
    if (currentPath === '.' || !currentPath) return [`root-${currentRoot.id}`];
    return [`root-${currentRoot.id}/${currentPath.replace(/\\/g, '/')}`];
  }, [currentPath, currentRoot]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const maxTree = Math.max(minTreeHeight, rect.height - minRootHeight - splitterSize);
      const next = Math.min(
        maxTree,
        Math.max(minTreeHeight, resizeStartRef.current.startHeight + (e.clientY - resizeStartRef.current.startY))
      );
      setTreePaneHeight(next);
    };
    const handleUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const maxTree = Math.max(minTreeHeight, rect.height - minRootHeight - splitterSize);
    setTreePaneHeight((prev) => Math.min(prev, maxTree));
  }, [currentRootId, treeRefreshKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="sidebar-main" ref={mainRef}>
        <div className="sidebar-pane" style={{ height: treePaneHeight, minHeight: minTreeHeight }}>
          <Flex justify="space-between" align="center" className="sidebar-pane-header">
            <Typography.Text strong>目录树</Typography.Text>
          </Flex>
          <div className="sidebar-tree-body">
            {currentRoot ? (
              <Tree
                showIcon
                blockNode
                selectedKeys={selectedKey}
                treeData={treeData}
                loadData={(node) => loadDirChildren(node as TreeNode)}
                onSelect={(keys, info) => {
                  const node = info.node as TreeNode;
                  if (node) onSelectPath(node.path);
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无根目录" />
            )}
          </div>
        </div>

        <div
          className="sidebar-splitter"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeStartRef.current = { startY: e.clientY, startHeight: treePaneHeight };
            document.body.style.cursor = 'row-resize';
            setIsResizing(true);
          }}
        />

        <div className="sidebar-pane sidebar-root-pane" style={{ minHeight: minRootHeight }}>
          <Flex justify="space-between" align="center" className="sidebar-pane-header">
            <Typography.Text strong>根目录</Typography.Text>
            <Button size="small" type="text" icon={<FolderAddOutlined />} onClick={onAddRoot}>
              添加
            </Button>
          </Flex>
          <div className="sidebar-roots-list">
            <List
              size="small"
              dataSource={roots}
              locale={{ emptyText: '暂无根目录' }}
              renderItem={(item) => (
                <Dropdown
                  trigger={['contextMenu']}
                  menu={{
                    items: [
                      {
                        key: 'remove',
                        danger: true,
                        label: '删除根目录',
                        onClick: () => onRemoveRoot(item.id)
                      }
                    ]
                  }}
                >
                  <List.Item
                    className={item.id === currentRootId ? 'active-root' : ''}
                    onClick={() => onSelectRoot(item.id)}
                    style={{
                      cursor: 'pointer',
                      background: item.id === currentRootId ? 'var(--bg-hover)' : 'transparent',
                      borderRadius: 6,
                      padding: '6px 8px'
                    }}
                  >
                    <List.Item.Meta title={item.name} />
                  </List.Item>
                </Dropdown>
              )}
            />
          </div>
        </div>
      </div>

      <Divider style={{ margin: '10px 0' }} />
      <Flex vertical gap={6}>
        <Button icon={<HomeOutlined />} type="text">
          数据总览
        </Button>
        <Button icon={<ClockCircleOutlined />} type="text">
          临时文件
        </Button>
        <Button icon={<SettingOutlined />} type="text">
          设置
        </Button>
      </Flex>
    </div>
  );
};

export default SideBar;
