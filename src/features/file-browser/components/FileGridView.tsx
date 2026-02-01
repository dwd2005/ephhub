import React from 'react';
import { Card, Flex, Input, Tag } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { formatSize, formatTime, levelTagMeta } from '@/utils/format';
import FileIcon from './FileIcon';

type Props = {
  files: FileEntry[];
  selected: string[];
  fileRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  renamingPath: string | null;
  onFileClick: (e: React.MouseEvent, file: FileEntry) => void;
  onOpen: (file: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onRenameSubmit: (file: FileEntry, newName: string) => void;
  onFileNameClick: (e: React.MouseEvent, file: FileEntry) => void;
  operationStatus: Record<string, OperationStatus>;
  setRenamingPath: (path: string | null) => void;
};

const FileGridView: React.FC<Props> = ({
  files,
  selected,
  fileRefs,
  renamingPath,
  onFileClick,
  onOpen,
  onContextMenu,
  onRenameSubmit,
  onFileNameClick,
  operationStatus,
  setRenamingPath
}) => {
  const safeSelected = Array.isArray(selected) ? selected : [];

  return (
    <>
      {files.map((file) => (
        <Card
          key={file.relativePath}
          size="small"
          ref={(el) => {
            if (el) fileRefs.current[file.relativePath] = el;
          }}
          className={`file-card ${safeSelected.includes(file.relativePath) ? 'selected' : ''}`}
          onClick={(e) => onFileClick(e, file)}
          onDoubleClick={() => onOpen(file)}
          onContextMenu={(e) => onContextMenu(e, file)}
          extra={<Tag color={levelTagMeta(file.levelTag).color}>{levelTagMeta(file.levelTag).label}</Tag>}
        >
          <Flex align="center" gap={8}>
            {file.isDirectory ? (
              <FolderOpenOutlined />
            ) : (
              <FileIcon fullPath={file.fullPath} size="normal" ext={file.ext} />
            )}
            <div style={{ flex: 1 }}>
              {renamingPath === file.relativePath ? (
                <Input
                  defaultValue={file.name}
                  autoFocus
                  spellCheck={false}
                  onFocus={(e) => {
                    const val = e.target.value;
                    const dot = val.lastIndexOf('.');
                    const end = dot > 0 ? dot : val.length;
                    e.target.setSelectionRange(0, end);
                  }}
                  onBlur={(e) => onRenameSubmit(file, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRenameSubmit(file, (e.target as HTMLInputElement).value);
                    } else if (e.key === 'Escape') {
                      setRenamingPath(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%' }}
                />
              ) : (
                <div className="name" onClick={(e) => onFileNameClick(e, file)}>
                  {file.name}
                </div>
              )}
              <div className="meta">
                {file.isDirectory ? '文件夹' : formatSize(file.size)} ·{' '}
                {formatTime(file.customTime ? Date.parse(file.customTime) : file.created)}
              </div>
            </div>
            {operationStatus[file.fullPath] && (
              <Tag color="processing">{operationStatus[file.fullPath].operation}...</Tag>
            )}
          </Flex>
        </Card>
      ))}
    </>
  );
};

export default FileGridView;
