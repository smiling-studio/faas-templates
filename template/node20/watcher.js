require('dotenv/config');

// watcher.js - 通过子进程管理 index.js 的启停
const { spawn } = require('child_process');
const path = require('path');
const debug = require('debug');
const log = debug('node20:info');
const fs = require('fs');
const treeKill = require('tree-kill');

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

// 子进程引用
let serverProcess = null;

// 启动服务器子进程
function startServer() {
    const indexPath = path.join(__dirname, 'index.js');
    log(`启动服务: ${indexPath}`);

    serverProcess = spawn('node', [indexPath], {
        stdio: 'inherit',
        env: process.env
    });

    serverProcess.on('exit', (code, signal) => {
        log(`服务退出，退出码: ${code}, 信号: ${signal}`);
        
        // 生产环境下自动重启逻辑
        if (!isDev && code !== 0 && signal !== 'SIGTERM') {
            log('检测到异常退出，3秒后重启...');
            setTimeout(startServer, 3000);
        }
    });

    serverProcess.on('error', (err) => {
        log(`子进程错误: ${err.message}`);
    });

    return serverProcess;
}

// 停止服务器子进程
async function stopServer() {
    if (!serverProcess) {
        log('无运行中的服务进程');
        return;
    }

    return new Promise((resolve) => {
        const pid = serverProcess.pid;
        log(`正在停止服务进程 ${pid}...`);

        const killTimeout = setTimeout(() => {
            log('强制终止进程（30秒超时）');
            try {
                process.kill(pid, 'SIGKILL');
            } catch (err) {
                log(`SIGKILL 失败: ${err.message}`);
            }
            resolve();
        }, 30000);

        serverProcess.once('exit', () => {
            clearTimeout(killTimeout);
            log('服务进程已终止');
            resolve();
        });

        // 优先使用 tree-kill 终止进程树
        treeKill(pid, 'SIGTERM', (err) => {
            if (err) {
                log(`SIGTERM 失败: ${err.message}`);
                treeKill(pid, 'SIGKILL', (err) => {
                    if (!err) log('已发送 SIGKILL');
                });
            }
        });
    }).finally(() => {
        serverProcess = null;
    });
}

// 重启服务
async function restartServer() {
    log('触发服务重启...');
    try {
        await stopServer();
        startServer();
        log('服务重启完成');
    } catch (err) {
        log(`重启失败: ${err.message}`);
    }
}

// 开发环境文件监控
if (isDev) {
    try {
        const chokidar = require('chokidar');
        const watcher = chokidar.watch(process.cwd(), {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                /(^|[/\\])\../, // 忽略所有隐藏文件
                /\.DS_Store/
            ],
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 1000,
                pollInterval: 100
            }
        });

        let restartPending = false;
        let debounceTimer = null;

        watcher
            .on('all', (event, path) => {
                log(`检测到文件变更: ${path}`);
                
                // 防抖处理（500ms）
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    if (restartPending) return;
                    restartPending = true;
                    
                    try {
                        await restartServer();
                    } finally {
                        restartPending = false;
                    }
                }, 500);
            })
            .on('error', error => log(`监控错误: ${error}`));

        // 进程信号处理
        const gracefulShutdown = async () => {
            log('关闭文件监控...');
            await watcher.close();
            await stopServer();
            process.exit(0);
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        process.on('uncaughtException', async (err) => {
            log(`未捕获异常: ${err.message}`);
            await gracefulShutdown();
            process.exit(1);
        });

        log('开发模式：文件监控已启动');
    } catch (err) {
        log(`chokidar 加载失败: ${err.message}`);
    }
}

// 启动初始服务
startServer();