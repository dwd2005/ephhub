class PathTaskQueue {
  constructor() {
    // 每个 key 维护一个尾部 Promise，保证同 key 串行执行
    this.tails = new Map();
  }

  // 获取某个 key 的执行权，返回释放函数
  async acquire(key) {
    const prev = this.tails.get(key) || Promise.resolve();
    let release;
    const lock = new Promise((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => lock);
    this.tails.set(key, tail);
    await prev;
    return () => {
      release();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    };
  }

  // 多 key 串行获取，保证不同任务不会死锁
  async run(keys, task) {
    const ordered = [...new Set(keys.filter(Boolean))].sort();
    if (!ordered.length) return task();
    const releases = [];
    try {
      for (const key of ordered) {
        releases.push(await this.acquire(key));
      }
      return await task();
    } finally {
      // 反向释放，避免释放顺序影响后续排队
      releases.reverse().forEach((fn) => fn());
    }
  }
}

module.exports = {
  PathTaskQueue
};
