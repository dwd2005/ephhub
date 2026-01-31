import React, { useEffect, useRef } from 'react';
import { App as AntApp } from 'antd';
import { useStore } from '@/store/useStore';

const MessageHub: React.FC = () => {
  const { notification } = AntApp.useApp();
  const { messages, removeMessage } = useStore();
  const displayedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    messages.forEach((msg) => {
      if (displayedRef.current.has(msg.id)) return;
      displayedRef.current.add(msg.id);
      notification.open({
        message: msg.title,
        description: msg.message,
        type: msg.type,
        duration: msg.duration || 3,
        onClose: () => {
          displayedRef.current.delete(msg.id);
          removeMessage(msg.id);
        }
      });
    });
  }, [messages, notification, removeMessage]);

  return null;
};

export default MessageHub;
