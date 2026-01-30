import React from 'react';
import { Card, Flex, Tag } from 'antd';
import dayjs from 'dayjs';
import { formatTime } from '@/utils/format';

type Props = {
  buckets: TimeBucket[];
};

const TimeView: React.FC<Props> = ({ buckets }) => {
  const grouped = React.useMemo(() => {
    const map: Record<string, TimeBucket[]> = {};
    buckets.forEach((b) => {
      const key = b.time ? dayjs(b.time).format('YYYY年MM月') : '未定义';
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [buckets]);

  return (
    <Flex vertical gap={12}>
      {Object.entries(grouped).map(([key, list]) => (
        <Card key={key} title={key} size="small" variant="borderless">
          <Flex vertical gap={6}>
            {list.map((item) => (
              <Flex key={item.fullPath} align="center" gap={8}>
                <Tag color="blue">{formatTime(item.time)}</Tag>
                <span>{item.relativePath}</span>
              </Flex>
            ))}
          </Flex>
        </Card>
      ))}
    </Flex>
  );
};

export default TimeView;
