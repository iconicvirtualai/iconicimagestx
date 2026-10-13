/**
 * In-memory Firestore for the Square webhook fixture and its tests.
 * Supports the reads, queries, and transactions the paid-unlock path uses.
 * It does not open a network connection.
 */

export interface MemoryDocSnap {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  ref: MemoryDocRef;
}

export interface MemoryDocRef {
  id: string;
  path: string;
  get: () => Promise<MemoryDocSnap>;
  update: (data: Record<string, unknown>) => Promise<void>;
  set: (data: Record<string, unknown>) => Promise<void>;
}

export interface MemoryQuerySnap {
  empty: boolean;
  docs: MemoryDocSnap[];
}

export interface MemoryFirestoreHandle {
  db: FirebaseFirestore.Firestore;
  seed: (collection: string, id: string, data: Record<string, unknown>) => void;
  get: (collection: string, id: string) => Record<string, unknown> | undefined;
  dump: () => Record<string, Record<string, unknown>>;
  clear: () => void;
}

export function createMemoryFirestore(): MemoryFirestoreHandle {
  const store = new Map<string, Record<string, unknown>>();
  let sequence = 0;

  function nextId(): string {
    sequence += 1;
    return `mem${sequence.toString(36)}`;
  }

  function pathOf(collection: string, id: string): string {
    return `${collection}/${id}`;
  }

  function snapshot(collection: string, id: string): MemoryDocSnap {
    const path = pathOf(collection, id);
    const data = store.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      ref: docRef(collection, id),
    };
  }

  function docRef(collection: string, id: string): MemoryDocRef {
    const path = pathOf(collection, id);
    return {
      id,
      path,
      get: async () => snapshot(collection, id),
      async update(data) {
        const current = store.get(path);
        if (!current) throw new Error(`No document to update at ${path}`);
        store.set(path, { ...current, ...data });
      },
      async set(data) {
        store.set(path, { ...data });
      },
    };
  }

  function query(collection: string, filters: Array<[string, unknown]>, cap: number) {
    const api = {
      where(field: string, _op: string, value: unknown) {
        return query(collection, [...filters, [field, value]], cap);
      },
      limit(count: number) {
        return query(collection, filters, count);
      },
      orderBy() {
        return api;
      },
      async get(): Promise<MemoryQuerySnap> {
        const prefix = `${collection}/`;
        const docs = [...store.entries()]
          .filter(([path, data]) => {
            if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return false;
            return filters.every(([field, value]) => data[field] === value);
          })
          .slice(0, cap)
          .map(([path]) => snapshot(collection, path.slice(prefix.length)));
        return { empty: docs.length === 0, docs };
      },
    };
    return api;
  }

  function collectionApi(name: string) {
    return {
      doc: (id?: string) => docRef(name, id || nextId()),
      where: (field: string, _op: string, value: unknown) => query(name, [[field, value]], Number.POSITIVE_INFINITY),
      limit: (count: number) => query(name, [], count),
      orderBy: () => query(name, [], Number.POSITIVE_INFINITY),
      add: async (data: Record<string, unknown>) => {
        const ref = docRef(name, nextId());
        await ref.set(data);
        return ref;
      },
      get: () => query(name, [], Number.POSITIVE_INFINITY).get(),
    };
  }

  const db = {
    collection: (name: string) => collectionApi(name),
    async runTransaction<T>(fn: (tx: {
      get: (ref: MemoryDocRef) => Promise<MemoryDocSnap>;
      update: (ref: MemoryDocRef, data: Record<string, unknown>) => void;
      set: (ref: MemoryDocRef, data: Record<string, unknown>) => void;
    }) => Promise<T>): Promise<T> {
      const writes: Array<() => Promise<void>> = [];
      const tx = {
        get: (ref: MemoryDocRef) => ref.get(),
        update: (ref: MemoryDocRef, data: Record<string, unknown>) => {
          writes.push(() => ref.update(data));
        },
        set: (ref: MemoryDocRef, data: Record<string, unknown>) => {
          writes.push(() => ref.set(data));
        },
      };
      const result = await fn(tx);
      for (const write of writes) await write();
      return result;
    },
  };

  return {
    db: db as unknown as FirebaseFirestore.Firestore,
    seed(collectionName, id, data) {
      store.set(pathOf(collectionName, id), { ...data });
    },
    get(collectionName, id) {
      const data = store.get(pathOf(collectionName, id));
      return data ? { ...data } : undefined;
    },
    dump() {
      const out: Record<string, Record<string, unknown>> = {};
      for (const [path, data] of store.entries()) out[path] = { ...data };
      return out;
    },
    clear() {
      store.clear();
    },
  };
}
