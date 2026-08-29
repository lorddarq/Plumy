#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('electron-store');
const { resolveWorkspaceUserDataPath } = require('../services/workspace-paths.cjs');

const APP_NAME = 'Omvra';
const isDev = process.env.NODE_ENV !== 'production' && process.env.OMVRA_PACKAGED !== '1';
const storeName = process.env.OMVRA_STORE_NAME || (isDev ? 'omvra-store-dev' : 'omvra-store');

function appDataPath() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function readGoals(store) {
  const goals = store.get('omvra.goals.v1');
  return Array.isArray(goals) ? goals.map(goal => ({
    id: goal?.id,
    title: goal?.title,
    revision: goal?.revision ?? goal?.__mcpRevision ?? 0,
  })) : [];
}

async function readMcpGoals(endpoint) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const initialize = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'omvra-workspace-diagnostics', version: '1.0.0' } } }) });
  const sessionId = initialize.headers.get('mcp-session-id');
  const sessionHeaders = sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers;
  await fetch(endpoint, { method: 'POST', headers: sessionHeaders, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) });
  const response = await fetch(endpoint, { method: 'POST', headers: sessionHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'goals.list', arguments: {} } }) });
  const payload = await response.json();
  const content = payload?.result?.content?.find(item => item?.type === 'text')?.text;
  let goals = payload?.result?.structuredContent?.goals;
  if (!Array.isArray(goals) && content) {
    try { goals = JSON.parse(content)?.goals; } catch { goals = []; }
  }
  return { endpoint, status: response.status, goals: Array.isArray(goals) ? goals.map(goal => ({ id: goal?.id, title: goal?.title, revision: goal?.revision ?? goal?.__mcpRevision ?? 0, execution: goal?.execution?.state || null })) : [], error: payload?.error?.message || null };
}

async function main() {
  const args = process.argv.slice(2);
  const endpointIndex = args.indexOf('--mcp');
  const exportIndex = args.indexOf('--export');
  const exportStoreIndex = args.indexOf('--export-store');
  const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : 'http://127.0.0.1:3456/mcp';
  const userDataPath = resolveWorkspaceUserDataPath({ appDataPath: appDataPath(), appName: APP_NAME, isDev }) || path.join(appDataPath(), APP_NAME);
  const store = new Store({ name: storeName, cwd: userDataPath });
  const report = {
    generatedAt: new Date().toISOString(),
    process: { cwd: process.cwd(), node: process.version, isDev },
    localStore: { name: storeName, userDataPath, filePath: store.path, goals: readGoals(store) },
    mcp: null,
  };
  try { report.mcp = await readMcpGoals(endpoint); } catch (error) { report.mcp = { endpoint, status: null, goals: [], error: error?.message || String(error) }; }
  report.matches = report.localStore.goals.map(local => ({ localId: local.id, localTitle: local.title, mcpIds: report.mcp.goals.filter(remote => remote.title === local.title).map(remote => remote.id) }));
  const output = JSON.stringify(report, null, 2);
  if (exportStoreIndex >= 0) {
    const outputPath = path.resolve(args[exportStoreIndex + 1]);
    fs.writeFileSync(outputPath, `${JSON.stringify(store.store, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${outputPath}`);
  }
  if (exportIndex >= 0) {
    const outputPath = path.resolve(args[exportIndex + 1]);
    fs.writeFileSync(outputPath, `${output}\n`, 'utf8');
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(output);
  }
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
