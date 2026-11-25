import { performance } from 'perf_hooks'
import '../handler.ts'
import seeCommands from '../core/system/commandLoader.ts'

const start = performance.now()
const total = await seeCommands()
console.log(JSON.stringify({ total, loaderMs: Number((performance.now() - start).toFixed(2)) }))
process.exit(0)
