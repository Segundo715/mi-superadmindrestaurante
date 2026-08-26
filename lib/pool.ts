// Corre `fn` sobre `items` con concurrencia limitada (`size` a la vez), tolerante a fallos
// individuales (usa allSettled, no all — un ítem que truena no debe tumbar el resto del lote).
export async function runInPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size)
    results.push(...await Promise.allSettled(chunk.map(fn)))
  }
  return results
}
