import React from 'react';
import { Button, Flex, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined,
  PlusOutlined as PlusTabOutlined
} from '@ant-design/icons';

type Props = {
  tabItems: TabsProps['items'];
  activeTab: string;
  onTabChange: (key: string) => void;
  onEditTabs: (targetKey: any, action: 'add' | 'remove') => void;
  onAddTab: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

const TopBar: React.FC<Props> = ({
  tabItems,
  activeTab,
  onTabChange,
  onEditTabs,
  onAddTab,
  onMinimize,
  onMaximize,
  onClose
}) => {
  return (
    <div className="top-bar">
      <div className="tab-bar">
        <Tabs
          type="editable-card"
          items={tabItems}
          hideAdd
          activeKey={activeTab}
          onChange={onTabChange}
          onEdit={onEditTabs as any}
          tabBarExtraContent={
            <Button
              type="text"
              icon={<PlusTabOutlined />}
              onClick={onAddTab}
              style={{ paddingInline: 4 }}
            />
          }
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
