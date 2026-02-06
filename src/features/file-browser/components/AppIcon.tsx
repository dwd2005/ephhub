import React from 'react';
import { AppstoreOutlined } from '@ant-design/icons';
import { useIcon } from '../hooks/useIcon';

interface AppIconProps {
  path?: string;
  size?: 'small' | 'normal';
}

const AppIcon: React.FC<AppIconProps> = ({ path, size = 'small' }) => {
  const icon = useIcon(path || '', size);
  const pixel = size === 'normal' ? 32 : 18;

  if (icon) {
    return <img src={icon} width={pixel} height={pixel} style={{ objectFit: 'contain' }} />;
  }

  return <AppstoreOutlined />;
};

export default AppIcon;
