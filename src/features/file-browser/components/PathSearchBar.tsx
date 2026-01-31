import React from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Flex,
  Input,
  Segmented,
  Space,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined
} from '@ant-design/icons';

type BreadcrumbItem = { title: string; path: string };

type Props = {
  breadcrumb: BreadcrumbItem[];
  pathInputMode: boolean;
  pathInputValue: string;
  setPathInputMode: (value: boolean) => void;
  setPathInputValue: (value: string) => void;
  pathInputRef: React.RefObject<any>;
  onPathSubmit: () => void;
  onPathKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPathFocus: () => void;
  onBreadcrumbClick: (path: string) => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onBack: () => void;
  onRefresh: () => void;
  levelTagOptions: { key: LevelTag; label: string }[];
};

const PathSearchBar: React.FC<Props> = ({
  breadcrumb,
  pathInputMode,
  pathInputValue,
  setPathInputMode,
  setPathInputValue,
  pathInputRef,
  onPathSubmit,
  onPathKeyDown,
  onPathFocus,
  onBreadcrumbClick,
  searchOpen,
  onToggleSearch,
  onBack,
  onRefresh,
  levelTagOptions
}) => {
  return (
    <div className="middle-bar">
      <Card
        size="small"
        className="search-card"
        variant="borderless"
        style={{ position: 'relative', zIndex: 999 }}
      >
        <Flex align="center" gap={8} style={{ flex: 1 }}>
          <Space className="navigation-buttons">
            <Tooltip title="返回上一级">
              <Button icon={<ArrowLeftOutlined />} onClick={onBack} />
            </Tooltip>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={onRefresh} />
            </Tooltip>
          </Space>
          <div className="path-bar-container">
            {pathInputMode ? (
              <Input
                ref={pathInputRef}
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                onBlur={onPathSubmit}
                onKeyDown={onPathKeyDown}
                onFocus={onPathFocus}
                prefix={<FolderOpenOutlined />}
                className="path-bar-input"
                autoFocus
              />
            ) : (
              <div className="path-bar" onClick={() => setPathInputMode(true)}>
                <Flex align="center" gap={8}>
                  <FolderOpenOutlined />
                  <Breadcrumb
                    items={breadcrumb.map((item) => ({
                      title: (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onBreadcrumbClick(item.path);
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
            placeholder="搜索（暂未接入）"
            allowClear
            className="search-bar"
          />
          <Button icon={<SwapOutlined rotate={90} />} onClick={onToggleSearch}>
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
  );
};

export default PathSearchBar;
