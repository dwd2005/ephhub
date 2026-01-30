import React, { useEffect } from 'react';
import { App as AntApp } from 'antd';
import { useStore } from '@/store/useStore';

const MessageHub: React.FC = () => {
  const { notification } = AntApp.useApp();
  const { messages, removeMessage } = useStore();

  useEffect(() => {
    messages.forEach((msg) => {
      notification.open({
        message: msg.title,
        description: msg.message,
        type: msg.type,
        duration: msg.duration || 3,
        onClose: () => removeMessage(msg.id)
      });
    });
  }, [messages, notification, removeMessage]);

  return null;
};

export default MessageHub;
