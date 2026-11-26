/*
 * Colas acotadas para tareas pesadas.
 * Así los comandos rápidos no esperan a conversiones o descargas.
 */
export class TaskPool {
  private active = 0
  private queue: Array<() => void> = []

  constructor(
    private limit: number,
    private maxQueue = 8
  ) {}

  get pending() {
    return this.queue.length
  }

  get running() {
    return this.active
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1
            const next = this.queue.shift()
            if (next) next()
          })
      }

      if (this.active < this.limit) {
        start()
        return
      }

      if (this.queue.length < this.maxQueue) {
        this.queue.push(start)
        return
      }

      const error: any = new Error('Estoy saturado en este momento. Intenta de nuevo en unos segundos.')
      error.code = 'SATURATED'
      reject(error)
    })
  }
}

export const stickerTasks = new TaskPool(1, 8)
export const downloadTasks = new TaskPool(2, 8)
export const normalTasks = new TaskPool(12, 200)
