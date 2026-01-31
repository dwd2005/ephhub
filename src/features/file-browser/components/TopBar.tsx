import React, { useMemo, useRef } from 'react';
import { Button, Flex, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined
} from '@ant-design/icons';

type Props = {
  tabItems: TabsProps['items'];
  activeTab: string;
  onTabChange: (key: string) => void;
  onEditTabs: (targetKey: any, action: 'add' | 'remove') => void;
  onReorderTabs: (from: string, to: string) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

const TopBar: React.FC<Props> = ({
  tabItems,
  activeTab,
  onTabChange,
  onEditTabs,
  onReorderTabs,
  onMinimize,
  onMaximize,
  onClose
}) => {
  const dragKeyRef = useRef<string | null>(null);

  const draggableItems = useMemo(
    () =>
      (tabItems || []).map((item) => ({
        ...item,
        label: (
          <div
            className="tab-label"
            draggable
            onDragStart={(e) => {
              dragKeyRef.current = String(item.key);
              e.dataTransfer?.setData('text/plain', String(item.key));
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragKeyRef.current || e.dataTransfer?.getData('text/plain');
              dragKeyRef.current = null;
              const to = String(item.key);
              if (from && to && from !== to) {
                onReorderTabs(from, to);
              }
            }}
            onDragEnd={() => {
              dragKeyRef.current = null;
            }}
          >
            {item.label}
          </div>
        )
      })),
    [tabItems, onReorderTabs]
  );

  return (
    <div className="top-bar">
      <div className="tab-bar">
        <Tabs
          type="editable-card"
          items={draggableItems}
          hideAdd={false}
          activeKey={activeTab}
          onChange={onTabChange}
          onEdit={onEditTabs as any}
        />
      </div>
      <div className="window-controls">
        <Flex gap={8}>
          <Button type="text" icon={<MinusOutlined />} onClick={onMinimize} />
          <Button type="text" icon={<BorderOutlined />} onClick={onMaximize} />
          <Button type="text" icon={<CloseOutlined />} danger onClick={onClose} />
        </Flex>
      </div>
    </div>
  );
};

export default TopBar;
