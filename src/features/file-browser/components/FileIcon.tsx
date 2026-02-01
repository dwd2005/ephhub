import React from 'react';
import { FileOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useIcon } from '../hooks/useIcon';

type Props = {
  fullPath: string;
  size?: 'small' | 'normal';
  ext?: string;
};

const FileIcon: React.FC<Props> = ({ fullPath, size = 'small', ext = '' }) => {
  const icon = useIcon(fullPath, size);
  const pixel = size === 'normal' ? 32 : 18;

  if (icon) {
    return <img src={icon} width={pixel} height={pixel} style={{ objectFit: 'contain' }} />;
  }

  if (!ext) return <FileOutlined />;
  return (
    <Tooltip title={ext.toUpperCase()}>
      <FileOutlined />
    </Tooltip>
  );
};

export default FileIcon;
