/**
 * Run `fn` over all `items` with at most `concurrency` tasks in flight at once.
 *
 * JS is single-threaded: `idx++` is atomic across workers because no `await`
 * intervenes between the bounds check and the increment, so each item is
 * claimed exactly once.
 */
export async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) await fn(items[idx++]!);
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}
