import React from 'react';
import { Flex, Input, Tag } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { formatTime, levelTagMeta } from '@/utils/format';
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

const FileListView: React.FC<Props> = ({
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
      <div className="list-header">
        <div className="list-header-name">名称</div>
        <div className="list-header-date">修改日期</div>
        <div className="list-header-date">文件日期</div>
        <div className="list-header-level">等级</div>
      </div>
      {files.map((file) => (
        <div
          key={file.relativePath}
          ref={(el) => {
            if (el) fileRefs.current[file.relativePath] = el;
          }}
          className={`list-item ${safeSelected.includes(file.relativePath) ? 'selected' : ''}`}
          onClick={(e) => onFileClick(e, file)}
          onDoubleClick={() => onOpen(file)}
          onContextMenu={(e) => onContextMenu(e, file)}
        >
          <div className="list-item-name">
            <Flex align="center" gap={8}>
              {file.isDirectory ? (
                <FolderOpenOutlined />
              ) : (
                <FileIcon fullPath={file.fullPath} size="small" ext={file.ext} />
              )}
              {renamingPath === file.relativePath ? (
                <Input
                  defaultValue={file.name}
                  autoFocus
                  spellCheck={false}
                  onFocus={(e) => {
                    const val = e.target.value;
                    const dot = val.lastIndexOf('.');
                    const end = dot > 0 ? dot : val.length;
                    // 选中不含扩展名
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
                  style={{ flex: 1 }}
                />
              ) : (
                <span onClick={(e) => onFileNameClick(e, file)}>{file.name}</span>
              )}
            </Flex>
          </div>
          <div className="list-item-date">{formatTime(file.modified)}</div>
          <div className="list-item-date">
            {file.customTime ? formatTime(Date.parse(file.customTime)) : '-'}
          </div>
          <div className="list-item-level">
            <Tag color={levelTagMeta(file.levelTag).color}>
              {levelTagMeta(file.levelTag).label}
            </Tag>
            {operationStatus[file.fullPath] && (
              <Tag color="processing" style={{ marginLeft: 8 }}>
                {operationStatus[file.fullPath].operation}...
              </Tag>
            )}
          </div>
        </div>
      ))}
    </>
  );
};

export default FileListView;
