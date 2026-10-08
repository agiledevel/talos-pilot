import { useState } from "react";
import { App, ConfigProvider, Empty, Layout, Space, Switch, Typography, theme } from "antd";
import styles from "./PilotApp.module.css";

/** Provides the desktop shell and session-only appearance preferences. */
export function PilotApp() {
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  return (
    <ConfigProvider
      theme={{
        algorithm: [
          dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          ...(compact ? [theme.compactAlgorithm] : []),
        ],
        token: {
          colorPrimary: "#1668dc",
          colorTextDescription: dark ? "#bfbfbf" : "#595959",
          borderRadius: 6,
          fontFamily: "system-ui, sans-serif",
        },
      }}
    >
      <App>
        <Layout className={styles.shell}>
          <Layout.Header className={styles.header}>
            <Typography.Title level={1} style={{ margin: 0, fontSize: 24 }}>
              Talos Pilot
            </Typography.Title>
            <Space wrap>
              <Switch checked={dark} onChange={setDark} aria-label="Dark theme" />
              <Typography.Text>Dark theme</Typography.Text>
              <Switch checked={compact} onChange={setCompact} aria-label="Compact density" />
              <Typography.Text>Compact density</Typography.Text>
            </Space>
          </Layout.Header>
          <Layout.Content className={styles.content}>
            <Typography.Title level={2}>Clusters</Typography.Title>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No clusters connected" />
            <Typography.Paragraph
              style={{ textAlign: "center", maxWidth: 480, margin: "24px auto" }}
            >
              Connection setup is under development. This foundation build does not access clusters.
            </Typography.Paragraph>
          </Layout.Content>
          <Layout.Footer className={styles.footer}>
            Foundation preview · Local desktop application
          </Layout.Footer>
        </Layout>
      </App>
    </ConfigProvider>
  );
}
