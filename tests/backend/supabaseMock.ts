type TableResult = { data: any; error: any };

type StorageUploadCall = { bucket: string; path: string; size: number; contentType?: string };

export type SupabaseState = {
  users: Map<string, { id: string; email?: string }>;
  tables: Map<string, TableResult>;
  inserts: Map<string, any[]>;
  storageUploads: StorageUploadCall[];
  storageDownload: (bucket: string, path: string) => Promise<TableResult>;
  reset(): void;
};

const state: SupabaseState = {
  users: new Map(),
  tables: new Map(),
  inserts: new Map(),
  storageUploads: [],
  storageDownload: async () => ({ data: null, error: { message: "not-found" } }),
  reset() {
    this.users.clear();
    this.tables.clear();
    this.inserts.clear();
    this.storageUploads.length = 0;
    this.storageDownload = async () => ({
      data: null,
      error: { message: "not-found" },
    });
  },
};

export const supabaseState = state;

function makeQueryBuilder(table: string, result: TableResult) {
  const self: any = {
    select: () => self,
    eq: () => self,
    neq: () => self,
    in: () => self,
    gte: () => self,
    lte: () => self,
    order: () => self,
    limit: () => self,
    update: () => self,
    delete: () => self,
    insert: (payload: any) => {
      const list = state.inserts.get(table) ?? [];
      list.push(payload);
      state.inserts.set(table, list);
      return self;
    },
    upsert: (payload: any) => {
      const list = state.inserts.get(table) ?? [];
      list.push(payload);
      state.inserts.set(table, list);
      return self;
    },
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return self;
}

export function supabaseMockModule() {
  return {
    createClient: () => ({
      auth: {
        getUser: async (token: string) => {
          const user = state.users.get(token);
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: "invalid-token" } };
        },
      },
      from: (table: string) =>
        makeQueryBuilder(table, state.tables.get(table) ?? { data: [], error: null }),
      storage: {
        from: (bucket: string) => ({
          download: (path: string) => state.storageDownload(bucket, path),
          upload: async (path: string, buffer: Buffer | Uint8Array, opts?: { contentType?: string }) => {
            state.storageUploads.push({
              bucket,
              path,
              size: (buffer as any)?.length ?? 0,
              contentType: opts?.contentType,
            });
            return { data: { path }, error: null };
          },
          remove: async () => ({ data: null, error: null }),
          createSignedUrl: async () => ({ data: null, error: null }),
        }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    }),
  };
}
