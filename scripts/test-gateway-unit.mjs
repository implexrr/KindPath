import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
const docker = process.platform === 'darwin' ? '/Applications/Docker.app/Contents/Resources/bin/docker' : '/usr/bin/docker';
const socket = process.platform === 'darwin' ? join(homedir(), '.docker/run/docker.sock') : '/var/run/docker.sock';
const child = spawn(docker, ['--host', `unix://${socket}`, 'run', '--rm', '--pull=never', '--network=none', '--read-only', '--user=1000:1000', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--memory=128m', '--cpus=0.5', '--pids-limit=64', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=16777216', '--entrypoint=node', 'kindpath-fixture-scanner:local', '--test', 'gateway/policy.test.mjs', 'gateway/controller.test.mjs', 'gateway/proxy.test.mjs', 'public-report.test.mjs', 'firewall/policy.test.mjs'], { env:{PATH:'/usr/bin:/bin'}, stdio:'inherit' });
process.exitCode = await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
