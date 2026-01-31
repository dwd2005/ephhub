import React from 'react';
import { FileOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

const FileIcon: React.FC<{ ext: string }> = ({ ext }) => {
  if (!ext) return <FileOutlined />;
  return (
    <Tooltip title={ext.toUpperCase()}>
      <FileOutlined />
    </Tooltip>
  );
};

export default FileIcon;
