import { startRuntime } from './local-private-runtime.mjs';
const runtime=await startRuntime(8788);
console.log('Local IB browser-test runtime ready.');
process.on('SIGINT',()=>{runtime.stop();process.exit();});
process.on('SIGTERM',()=>{runtime.stop();process.exit();});
