export type QueueItem = {
  name: string;
  account?: string;
  priority: 0 | 1 | 2;
  attempts?: number;
};

/** Priority queue (0 = priority accounts, 1 = ladder, 2 = online), deduped by lowercased name while queued. */
export class CharQueue {
  private lanes: Array<Map<string, QueueItem>> = [new Map(), new Map(), new Map()];
  private queued = new Map<string, 0 | 1 | 2>();

  push(item: QueueItem): boolean {
    const key = item.name.toLowerCase();
    const cur = this.queued.get(key);
    if (cur !== undefined) {
      if (item.priority >= cur) return false;
      // Promote to the more urgent lane, keeping a known account.
      const old = this.lanes[cur].get(key)!;
      this.lanes[cur].delete(key);
      this.lanes[item.priority].set(key, { ...old, ...item, account: item.account ?? old.account });
      this.queued.set(key, item.priority);
      return true;
    }
    this.queued.set(key, item.priority);
    this.lanes[item.priority].set(key, item);
    return true;
  }

  shift(): QueueItem | undefined {
    for (const lane of this.lanes) {
      const first = lane.entries().next();
      if (!first.done) {
        const [key, item] = first.value;
        lane.delete(key);
        this.queued.delete(key);
        return item;
      }
    }
    return undefined;
  }

  get size(): number {
    return this.queued.size;
  }
}
