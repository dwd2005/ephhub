import React, { useEffect, useMemo, useState } from 'react';
import { Button, Divider, Flex, List, Typography, Tree, Empty } from 'antd';
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
  onSelectPath,
  currentPath,
  treeRefreshKey
}) => {
  const { handle } = useApiHelpers();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

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
      window.api.list({ rootId: currentRoot.id, relativePath: node.path })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
          <Typography.Text strong>目录树</Typography.Text>
        </Flex>
        <div
          style={{
            flex: 1,
            minHeight: 180,
            overflow: 'auto',
            padding: '6px 4px',
            borderRadius: 6,
            border: '1px solid var(--divider-color)',
            background: 'var(--bg-primary)'
          }}
        >
          {currentRoot ? (
            <Tree
              showIcon
              blockNode
              height={360}
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

        <Divider style={{ margin: '10px 0' }} />

        <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
          <Typography.Text strong>根目录</Typography.Text>
          <Button size="small" type="text" icon={<FolderAddOutlined />} onClick={onAddRoot}>
            添加
          </Button>
        </Flex>
        <div style={{ maxHeight: 140, overflow: 'auto' }}>
          <List
            size="small"
            dataSource={roots}
            locale={{ emptyText: '暂无根目录' }}
            renderItem={(item) => (
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
            )}
          />
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
