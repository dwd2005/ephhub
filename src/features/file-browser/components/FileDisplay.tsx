import React from 'react';
import { Button, Empty, Flex, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import TimeView from '@/components/TimeView';
import FileListView from './FileListView';
import FileGridView from './FileGridView';

type SelectionBox = { x: number; y: number; width: number; height: number } | null;

type Props = {
  loading: boolean;
  currentRootId: string | null;
  openAddRoot: () => void;
  viewMode: ViewMode;
  timeBuckets: TimeBucket[];
  displayMode: DisplayMode;
  files: FileEntry[];
  selected: string[];
  renamingPath: string | null;
  setRenamingPath: (path: string | null) => void;
  operationStatus: Record<string, OperationStatus>;
  fileRefs: React.MutableRefObject<Record<string, HTMLDivElement>>;
  fileAreaRef: React.RefObject<HTMLDivElement>;
  selectionBox: SelectionBox;
  onFileAreaMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onFileAreaMouseMove: React.MouseEventHandler<HTMLDivElement>;
  onFileAreaMouseUp: React.MouseEventHandler<HTMLDivElement>;
  onBlankContextMenu: React.MouseEventHandler<HTMLDivElement>;
  onFileClick: (e: React.MouseEvent, file: FileEntry) => void;
  onFileContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onFileNameClick: (e: React.MouseEvent, file: FileEntry) => void;
  onRenameSubmit: (file: FileEntry, newName: string) => void;
  onOpen: (file: FileEntry) => void;
};

const FileDisplay: React.FC<Props> = ({
  loading,
  currentRootId,
  openAddRoot,
  viewMode,
  timeBuckets,
  displayMode,
  files,
  selected,
  renamingPath,
  setRenamingPath,
  operationStatus,
  fileRefs,
  fileAreaRef,
  selectionBox,
  onFileAreaMouseDown,
  onFileAreaMouseMove,
  onFileAreaMouseUp,
  onBlankContextMenu,
  onFileClick,
  onFileContextMenu,
  onFileNameClick,
  onRenameSubmit,
  onOpen
}) => {
  return (
    <div
      className="file-display"
      ref={fileAreaRef}
      onMouseDown={onFileAreaMouseDown}
      onMouseMove={onFileAreaMouseMove}
      onMouseUp={onFileAreaMouseUp}
      onMouseLeave={onFileAreaMouseUp}
      onContextMenu={onBlankContextMenu}
    >
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            position: 'absolute',
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.width,
            height: selectionBox.height,
            border: '1px dashed #1890ff',
            backgroundColor: 'rgba(24, 144, 255, 0.1)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        />
      )}
      {loading ? (
        <Flex style={{ height: '100%' }} align="center" justify="center">
          <Spin />
        </Flex>
      ) : !currentRootId ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无根目录"
          style={{ marginTop: 80 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddRoot}>
            添加根目录
          </Button>
        </Empty>
      ) : viewMode === 'time' ? (
        <TimeView buckets={timeBuckets} />
      ) : (
        <div className={displayMode === 'list' ? 'list-view' : 'grid-view'}>
          {files.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
          ) : displayMode === 'list' ? (
            <FileListView
              files={files}
              selected={selected}
              fileRefs={fileRefs}
              renamingPath={renamingPath}
              onFileClick={onFileClick}
              onOpen={onOpen}
              onContextMenu={onFileContextMenu}
              onRenameSubmit={onRenameSubmit}
              onFileNameClick={onFileNameClick}
              operationStatus={operationStatus}
              setRenamingPath={setRenamingPath}
            />
          ) : (
            <FileGridView
              files={files}
              selected={selected}
              fileRefs={fileRefs}
              renamingPath={renamingPath}
              onFileClick={onFileClick}
              onOpen={onOpen}
              onContextMenu={onFileContextMenu}
              onRenameSubmit={onRenameSubmit}
              onFileNameClick={onFileNameClick}
              operationStatus={operationStatus}
              setRenamingPath={setRenamingPath}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default FileDisplay;
