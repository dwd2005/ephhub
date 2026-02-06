import React from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

type Props = {
  visible: boolean;
  position: { x: number; y: number };
  items: MenuProps['items'];
  onClose: () => void;
};

const ContextMenu: React.FC<Props> = ({ visible, position, items, onClose }) => {
  if (!visible) return null;

  return (
    <Dropdown
      menu={{
        items,
        onClick: (info) => {
          const shouldClose = items.find(item => item.key === info.key)?.closeOnClick !== false;
          if (shouldClose) onClose();
        }
      }}
      open={visible}
      trigger={['contextMenu']}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: 2,
          height: 2,
          zIndex: 2000
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </Dropdown>
  );
};

export default ContextMenu;
