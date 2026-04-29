#!/usr/bin/env node
import { Command } from 'commander';
import open from 'open';
import readline from 'readline';
import { attachVmService } from './vm-listener.js';
import { startServer } from './server.js';
import { loadConfig, saveConfig } from './config.js';
import { sniffVmServiceUri } from './uri-sniffer.js';

const program = new Command();

program
  .name('netscope')
  .option('--uri <uri>')
  .option('--project-root <path>')
  .option('-p, --port <port>', 'web port', '9527')
  .option('--no-open')
  .parse(process.argv);

const opts = program.opts<{ uri?: string; projectRoot?: string; port: string; open: boolean }>();
const port = Number(opts.port);
const config = loadConfig();
const server = startServer(port, config);

const boxWidth = Math.max(72, Math.min(100, (process.stdout.columns || 90) - 2));
const line = '─'.repeat(boxWidth);
const renderRow = (text: string) => {
  const inner = boxWidth - 2;
  const chars = Array.from(text);
  const clipped = chars.length > inner ? `${chars.slice(0, inner - 1).join('')}…` : text;
  const pad = Math.max(0, inner - Array.from(clipped).length);
  return `│${clipped}${' '.repeat(pad)}│`;
};
console.log(`
███╗   ██╗███████╗████████╗███████╗ ██████╗ ██████╗ ██████╗ ███████╗
████╗  ██║██╔════╝╚══██╔══╝██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
██╔██╗ ██║█████╗     ██║   ███████╗██║     ██║   ██║██████╔╝█████╗
██║╚██╗██║██╔══╝     ██║   ╚════██║██║     ██║   ██║██╔═══╝ ██╔══╝
██║ ╚████║███████╗   ██║   ███████║╚██████╗╚██████╔╝██║     ███████╗
╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═════╝ ╚═╝     ╚══════╝
`);
console.log(`\n┌${line}┐`);
console.log(renderRow(' NetScope CLI'));
console.log(`├${line}┤`);
console.log(renderRow(` 服务地址   http://127.0.0.1:${port}`));
console.log(renderRow(` Web UI    http://127.0.0.1:${port}`));
console.log(renderRow(` 配置      max-messages=${config.maxMessages}  body-limit=${config.bodyLimit}`));
console.log(`└${line}┘\n`);

if (opts.open) {
  void open(`http://127.0.0.1:${port}`);
}

let attached = false;
let lastVmAttached = false;
let lastError = '';
let lastSniffed = '';

const connect = (uri: string) => {
  if (attached) {
    console.log('[WARN] 已附着调试链路，V1 不支持运行中切换 URI');
    return;
  }
  attachVmService(
    uri,
    (event) => {
      const record = server.assembler.handleEvent(event);
      if (record) {
        const type = record.state === 'pending' ? 'request_started' : 'request_updated';
        server.broadcast({ type, payload: record } as any);
      }
      server.broadcast({ type: 'connection_state', payload: server.assembler.getStatus() });
    },
    (ok, err) => {
      server.assembler.setVmAttached(ok);
      const status = server.assembler.getStatus();
      if (err) status.lastError = err;
      server.broadcast({ type: 'connection_state', payload: status });
      if (ok && !lastVmAttached) {
        attached = true;
        lastVmAttached = true;
        console.log('[INFO] 已附着调试链路');
      }
      if (!ok && lastVmAttached) {
        lastVmAttached = false;
        console.log('[WARN] 调试链路已断开');
      }
      if (err && err !== lastError) {
        lastError = err;
        console.log(`[ERROR] ${err}`);
      }
    },
  );
};

if (opts.uri) {
  connect(opts.uri);
} else {
  console.log('请粘贴 Flutter 调试 URI 后回车');
  console.log('示例: ws://127.0.0.1:XXXXX/xxxx=/ws');
  console.log('自动嗅探: 已启用（剪贴板 / .dart_tool/netscope_vm_service_uri）');
}

setInterval(() => {
  if (attached) return;
  const sniffed = sniffVmServiceUri(opts.projectRoot);
  if (!sniffed) return;
  if (sniffed === lastSniffed) return;
  lastSniffed = sniffed;
  console.log(`\n[INFO] 嗅探到 VM Service: ${sniffed}`);
  console.log("[INFO] 输入 'y' 立即连接，或继续手动粘贴其他 URI");
}, 3000);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const cmd = line.trim();

  if (!cmd) return;
  if ((cmd === 'y' || cmd === 'yes') && !attached) {
    const sniffed = sniffVmServiceUri(opts.projectRoot);
    if (sniffed) {
      connect(sniffed);
    } else {
      console.log('[WARN] 未嗅探到可用 URI');
    }
    return;
  }
  if (cmd === 'help' || cmd === '-h') {
    console.log('\n可用命令:');
    console.log('  clear | -c                清空当前会话');
    console.log('  status | -s               查看当前状态');
    console.log('  max-messages | -mm <n>    设置最大记录数(下次启动生效)');
    console.log('  body-limit | -bl <n>      设置 body 截断上限(下次启动生效)');
    console.log('  exit | -e                 退出\n');
    return;
  }
  if (cmd === 'status' || cmd === '-s') {
    const status = server.assembler.getStatus();
    console.log(`serviceStarted=${status.serviceStarted} vmAttached=${status.vmAttached} sdkDetected=${status.sdkDetected} lastError=${status.lastError ?? '-'}`);
    return;
  }
  if (cmd === 'clear' || cmd === '-c') {
    server.assembler.clear();
    server.broadcast({ type: 'requests_cleared' });
    console.log('已清空');
    return;
  }
  if (cmd === 'exit' || cmd === '-e') {
    rl.close();
    server.close();
    process.exit(0);
  }
  if (cmd.startsWith('max-messages ') || cmd.startsWith('-mm ')) {
    const n = Number(cmd.split(/\s+/)[1]);
    if (Number.isFinite(n) && n > 0) {
      config.maxMessages = Math.floor(n);
      saveConfig(config);
      console.log(`已保存 max-messages=${config.maxMessages}，下次启动生效`);
    }
    return;
  }
  if (cmd.startsWith('body-limit ') || cmd.startsWith('-bl ')) {
    const n = Number(cmd.split(/\s+/)[1]);
    if (Number.isFinite(n) && n > 0) {
      config.bodyLimit = Math.floor(n);
      saveConfig(config);
      console.log(`已保存 body-limit=${config.bodyLimit}，下次启动生效`);
    }
    return;
  }

  if (cmd.startsWith('http://') || cmd.startsWith('https://') || cmd.startsWith('ws://') || cmd.startsWith('wss://')) {
    connect(cmd);
    return;
  }

  console.log('未知命令，输入 help 查看支持命令');
});
