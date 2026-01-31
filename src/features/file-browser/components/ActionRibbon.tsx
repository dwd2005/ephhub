import React from 'react';
import { Button, Card, Flex, Segmented, Space, Tag, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  ScissorOutlined,
  TagOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';

type Props = {
  onNewFolder: () => void;
  onSetLevel: (level: LevelTag) => void;
  onMoveOrCopy: (mode: 'move' | 'copy') => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onClearTemp: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  operationsBusy: boolean;
};

const ActionRibbon: React.FC<Props> = ({
  onNewFolder,
  onSetLevel,
  onMoveOrCopy,
  onDelete,
  onSelectAll,
  onClearSelection,
  onClearTemp,
  viewMode,
  setViewMode,
  displayMode,
  setDisplayMode,
  operationsBusy
}) => {
  return (
    <Card size="small" className="ribbon-card" variant="borderless">
      <Flex gap={12} wrap align="center">
        <Space>
          <Button icon={<FolderAddOutlined />} onClick={onNewFolder}>
            新建文件夹
          </Button>
        </Space>
        <Space>
          <Button icon={<TagOutlined />} onClick={() => onSetLevel('important')}>
            标记重要
          </Button>
          <Button onClick={() => onSetLevel('normal')}>标记常规</Button>
          <Button onClick={() => onSetLevel('temp')}>标记临时</Button>
          <Button onClick={() => onSetLevel(null)}>清空标记</Button>
        </Space>
        <Space>
          <Button icon={<ScissorOutlined />} onClick={() => onMoveOrCopy('move')}>
            剪切
          </Button>
          <Button icon={<CopyOutlined />} onClick={() => onMoveOrCopy('copy')}>
            复制
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
            删除
          </Button>
        </Space>
        <Space>
          <Button onClick={onSelectAll}>全选</Button>
          <Button onClick={onClearSelection}>清空选择</Button>
          <Button onClick={onClearTemp}>清空临时</Button>
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
  );
};

export default ActionRibbon;
