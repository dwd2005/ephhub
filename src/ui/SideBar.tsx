import React from 'react';
import { Button, Divider, Flex, List, Typography } from 'antd';
import {
  HomeOutlined,
  ClockCircleOutlined,
  FolderAddOutlined,
  SettingOutlined
} from '@ant-design/icons';

type Props = {
  roots: RootItem[];
  currentRootId: string | null;
  onSelectRoot: (id: string) => void;
  onAddRoot: () => void;
};

const SideBar: React.FC<Props> = ({ roots, currentRootId, onSelectRoot, onAddRoot }) => {
  return (
    <div>
      <Flex vertical gap={8}>
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

      <Divider style={{ margin: '12px 0' }} />
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Typography.Text strong>根目录</Typography.Text>
        <Button size="small" type="text" icon={<FolderAddOutlined />} onClick={onAddRoot}>
          添加
        </Button>
      </Flex>
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
            <List.Item.Meta title={item.name} description={item.path} />
          </List.Item>
        )}
      />
    </div>
  );
};

export default SideBar;
