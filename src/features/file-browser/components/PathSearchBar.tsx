import React from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Flex,
  Input,
  Segmented,
  Select,
  Space,
  Switch,
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
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder: string;
  searchDisabled: boolean;
  searchRegex: boolean;
  onSearchRegexChange: (val: boolean) => void;
  searchScope: SearchScope;
  onSearchScopeChange: (val: SearchScope) => void;
  filterType: SearchType;
  onFilterTypeChange: (val: SearchType) => void;
  filterLevel: LevelTag | 'all' | 'none';
  onFilterLevelChange: (val: LevelTag | 'all' | 'none') => void;
  filterExts: string[];
  onFilterExtsChange: (val: string[]) => void;
  timeField: SearchTimeField;
  onTimeFieldChange: (val: SearchTimeField) => void;
  timeRange: [any, any];
  onTimeRangeChange: (val: [any, any]) => void;
  onClearFilters: () => void;
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
  levelTagOptions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchDisabled,
  searchRegex,
  onSearchRegexChange,
  searchScope,
  onSearchScopeChange,
  filterType,
  onFilterTypeChange,
  filterLevel,
  onFilterLevelChange,
  filterExts,
  onFilterExtsChange,
  timeField,
  onTimeFieldChange,
  timeRange,
  onTimeRangeChange,
  onClearFilters
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
            placeholder={searchPlaceholder}
            allowClear
            className="search-bar"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={searchDisabled}
          />
          <Button
            icon={<SwapOutlined rotate={90} />}
            onClick={onToggleSearch}
            size="small"
            style={{ width: '94px' }}
            disabled={searchDisabled}
          >
            高级筛选
          </Button>
        </Flex>
        {searchOpen && !searchDisabled && (
          <Flex
            gap={12}
            wrap
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              padding: '12px 16px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              zIndex: 1000
            }}
          >
            <Flex align="center" gap={8}>
              <span style={{ color: 'var(--text-secondary)' }}>范围</span>
              <Segmented
                options={[
                  { label: '当前目录', value: 'current' },
                  { label: '含子目录', value: 'recursive' }
                ]}
                value={searchScope}
                onChange={(val) => onSearchScopeChange(val as SearchScope)}
                disabled={searchDisabled}
              />
            </Flex>

            <Flex align="center" gap={8}>
              <span style={{ color: 'var(--text-secondary)' }}>类型</span>
              <Segmented
                options={[
                  { label: '全部', value: 'all' },
                  { label: '文件', value: 'file' },
                  { label: '文件夹', value: 'dir' }
                ]}
                value={filterType}
                onChange={(val) => onFilterTypeChange(val as SearchType)}
                disabled={searchDisabled}
              />
            </Flex>

            <Flex align="center" gap={8}>
              <span style={{ color: 'var(--text-secondary)' }}>等级</span>
              <Segmented
                options={[
                  { label: '全部', value: 'all' },
                  { label: '无', value: 'none' },
                  ...levelTagOptions
                    .filter((o) => o.key !== null)
                    .map((o) => ({ label: o.label, value: o.key as string }))
                ]}
                value={filterLevel as any}
                onChange={(val) => onFilterLevelChange(val as any)}
                disabled={searchDisabled}
              />
            </Flex>

            <Flex align="center" gap={8}>
              <span style={{ color: 'var(--text-secondary)' }}>正则</span>
              <Switch checked={searchRegex} onChange={onSearchRegexChange} disabled={searchDisabled} />
            </Flex>

            <Flex align="center" gap={8} style={{ minWidth: 220 }}>
              <span style={{ color: 'var(--text-secondary)' }}>扩展名</span>
              <Select
                mode="tags"
                value={filterExts}
                onChange={(val) => onFilterExtsChange(val as string[])}
                placeholder=".txt, .png"
                tokenSeparators={[',', ';', ' ']}
                style={{ minWidth: 200 }}
                disabled={searchDisabled}
              />
            </Flex>

            <Flex align="center" gap={8}>
              <span style={{ color: 'var(--text-secondary)' }}>时间</span>
              <Select
                value={timeField}
                onChange={(val) => onTimeFieldChange(val as SearchTimeField)}
                style={{ width: 120 }}
                options={[
                  { label: '不筛选', value: 'none' },
                  { label: '修改时间', value: 'modified' },
                  { label: '创建时间', value: 'created' },
                  { label: '文件日期', value: 'custom' }
                ]}
                disabled={searchDisabled}
              />
              <DatePicker.RangePicker
                value={timeRange as any}
                onChange={(val) => onTimeRangeChange(val as any)}
                showTime
                disabled={searchDisabled || timeField === 'none'}
              />
            </Flex>

            <Button size="small" onClick={onClearFilters} disabled={searchDisabled}>
              清除筛选
            </Button>
          </Flex>
        )}
      </Card>
    </div>
  );
};

export default PathSearchBar;
