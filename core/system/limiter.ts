/*
 * Colas acotadas para tareas pesadas.
 * Así los comandos rápidos no esperan a conversiones o descargas.
 */
interface Waiter {
  start: () => void
}

export interface TaskPoolStats {
  name: string
  active: number
  pending: number
  limit: number
  maxQueue: number
}

export class TaskPool {
  private active = 0
  private queue: Waiter[] = []

  constructor(
    private name: string,
    private limit: number,
    private maxQueue = 8,
    private waitTimeoutMs = 30_000
  ) {}

  get pending() {
    return this.queue.length
  }

  get running() {
    return this.active
  }

  get stats(): TaskPoolStats {
    return {
      name: this.name,
      active: this.active,
      pending: this.queue.length,
      limit: this.limit,
      maxQueue: this.maxQueue,
    }
  }

  private saturated(message: string) {
    const error: any = new Error(message)
    error.code = 'SATURATED'
    return error
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined
      const entry: Waiter = {
        start: () => {
          if (timer) clearTimeout(timer)
          this.active += 1
          const finish = () => {
            this.active -= 1
            const next = this.queue.shift()
            if (next) next.start()
          }
          Promise.resolve()
            .then(task)
            .then(
              value => {
                finish()
                resolve(value)
              },
              error => {
                finish()
                reject(error)
              }
            )
        },
      }

      if (this.active < this.limit) {
        entry.start()
        return
      }

      if (this.queue.length < this.maxQueue) {
        timer = setTimeout(() => {
          const index = this.queue.indexOf(entry)
          if (index >= 0) this.queue.splice(index, 1)
          reject(
            this.saturated(
              `La cola de ${this.name} sigue llena (${this.active} activas, ${this.queue.length} esperando). Intenta de nuevo en unos segundos.`
            )
          )
        }, this.waitTimeoutMs)
        timer.unref?.()
        this.queue.push(entry)
        return
      }

      reject(
        this.saturated(
          `La cola de ${this.name} está llena (${this.active} activas, ${this.queue.length} esperando). Intenta de nuevo en unos segundos.`
        )
      )
    })
  }
}

export const stickerTasks = new TaskPool('stickers', 1, 8, 30_000)
export const downloadTasks = new TaskPool('descargas', 2, 8, 30_000)
export const normalTasks = new TaskPool('comandos', 12, 200, 20_000)
