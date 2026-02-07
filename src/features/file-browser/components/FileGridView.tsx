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
  searchTerm: string;
  searchRegex: boolean;
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
  setRenamingPath,
  searchTerm,
  searchRegex
}) => {
  const safeSelected = Array.isArray(selected) ? selected : [];

  const renderHighlightedName = (name: string) => {
    const keyword = (searchTerm || '').trim();
    if (!keyword) return name;
    try {
      if (searchRegex) {
        const re = new RegExp(keyword, 'ig');
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(name)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          if (start > lastIndex) {
            parts.push(name.slice(lastIndex, start));
          }
          parts.push(
            <mark className="search-hit" key={`${start}-${end}`}>
              {name.slice(start, end)}
            </mark>
          );
          lastIndex = end;
          if (match[0].length === 0) break;
        }
        if (lastIndex < name.length) {
          parts.push(name.slice(lastIndex));
        }
        return parts.length ? parts : name;
      }
      const lower = name.toLowerCase();
      const target = keyword.toLowerCase();
      const idx = lower.indexOf(target);
      if (idx === -1) return name;
      const before = name.slice(0, idx);
      const hit = name.slice(idx, idx + target.length);
      const after = name.slice(idx + target.length);
      return (
        <>
          {before}
          <mark className="search-hit">{hit}</mark>
          {after}
        </>
      );
    } catch {
      return name;
    }
  };

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
                  {renderHighlightedName(file.name)}
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
