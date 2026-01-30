import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import App from './pages/App';
import 'antd/dist/reset.css';
import './styles/variables.css';
import './styles/global.css';

const themeToken = {
  colorPrimary: '#3498db',
  colorText: '#2c3e50',
  fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
  borderRadius: 6
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: themeToken,
        components: {
          Button: { controlHeight: 32 }
        }
      }}
    >
      <AntApp notification={{ duration: 3 }}>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
