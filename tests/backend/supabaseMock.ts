type TableResult = { data: any; error: any };

export type SupabaseState = {
  users: Map<string, { id: string; email?: string }>;
  tables: Map<string, TableResult>;
  storageDownload: (bucket: string, path: string) => Promise<TableResult>;
  reset(): void;
};

const state: SupabaseState = {
  users: new Map(),
  tables: new Map(),
  storageDownload: async () => ({ data: null, error: { message: "not-found" } }),
  reset() {
    this.users.clear();
    this.tables.clear();
    this.storageDownload = async () => ({
      data: null,
      error: { message: "not-found" },
    });
  },
};

export const supabaseState = state;

function makeQueryBuilder(result: TableResult) {
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
    insert: () => self,
    upsert: () => self,
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
        makeQueryBuilder(state.tables.get(table) ?? { data: [], error: null }),
      storage: {
        from: (bucket: string) => ({
          download: (path: string) => state.storageDownload(bucket, path),
          upload: async () => ({ data: null, error: null }),
          remove: async () => ({ data: null, error: null }),
          createSignedUrl: async () => ({ data: null, error: null }),
        }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    }),
  };
}
