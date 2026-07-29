function registerRuntimeIpcHandlers({
  ipcMain,
  getAppRuntimeInfo,
  restartMcpServer,
  isMcpServerRunning,
  getMcpListenerStatus,
}) {
  ipcMain.handle('app/get-runtime-info', () => getAppRuntimeInfo());
  ipcMain.handle('mcp/restart-server', () => {
    try {
      restartMcpServer();
      if (!isMcpServerRunning()) {
        return {
          success: false,
          error: 'MCP server is disabled. Enable mcpAgentAccessEnabled or set OMVRA_ENABLE_MCP_SERVER=1.',
        };
      }
      return { success: true, listenerStatus: getMcpListenerStatus() };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  });
}

module.exports = { registerRuntimeIpcHandlers };
