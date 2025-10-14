import { App as SlackClient } from '@slack/bolt'
import type { UsersInfoResponse } from '@slack/web-api'

interface CacheItem<T> {
  data: Promise<T>
  expiry: number
}

export class SlackCache {
  private userCache: Record<string, CacheItem<UsersInfoResponse>> = {}

  constructor(private slack: SlackClient) {}

  private async tryCache<K extends string | number | symbol, T>(
    cache: Record<K, CacheItem<T>>,
    key: K,
    func: (key: K) => T | Promise<T>
  ): Promise<T> {
    const cachedItem = cache[key]
    if (cachedItem && cachedItem.expiry >= Date.now()) {
      return cachedItem.data
    }
    const item: CacheItem<T> = {
      data: (async () => func(key))(),
      expiry: Date.now() + 1 * 60 * 1000,
    }
    cache[key] = item
    return item.data
  }

  async getUser(userId: string) {
    return this.tryCache(this.userCache, userId, () =>
      this.slack.client.users.info({
        user: userId,
        include_locale: true,
      })
    )
  }
}
