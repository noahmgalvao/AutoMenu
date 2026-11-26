import type { PGlite } from '@electric-sql/pglite';
const quote = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/i.test(name))
    throw new Error('Invalid test identifier'); return `"${name}"`; };
/** Test-only PostgREST subset, executing the production repository against PostgreSQL. */
export function revisionPostgrest(db: PGlite) {
    class Query implements PromiseLike<any> {
        private verb = 'select';
        private columns = '*';
        private filters: string[] = [];
        private params: unknown[] = [];
        private ordering = '';
        private take = '';
        private cardinality = 'many';
        private values: any;
        private options: any = {};
        private count = false;
        private head = false;
        private returning = false;
        constructor(private table: string) { }
        private bind(value: unknown) { this.params.push(value); return `$${this.params.length}`; }
        private field(name: string) { const match = /^(\w+)->>(\w+)$/.exec(name); return match ? `${quote(match[1])}->>'${match[2]}'` : quote(name); }
        select(columns = '*', options: any = {}) { this.columns = columns; this.count = options.count === 'exact'; this.head = !!options.head; if (this.verb !== 'select')
            this.returning = true; return this; }
        eq(key: string, value: any) { this.filters.push(`${this.field(key)}=${this.bind(value)}`); return this; }
        neq(key: string, value: any) { this.filters.push(`${this.field(key)}<>${this.bind(value)}`); return this; }
        gt(key: string, value: any) { this.filters.push(`${this.field(key)}>${this.bind(value)}`); return this; }
        lt(key: string, value: any) { this.filters.push(`${this.field(key)}<${this.bind(value)}`); return this; }
        gte(key: string, value: any) { this.filters.push(`${this.field(key)}>=${this.bind(value)}`); return this; }
        lte(key: string, value: any) { this.filters.push(`${this.field(key)}<=${this.bind(value)}`); return this; }
        is(key: string, value: any) { if (value !== null)
            throw new Error('Test is only supports null'); this.filters.push(`${this.field(key)} is null`); return this; }
        not(key: string, operator: string, value: any) { if (operator !== 'is' || value !== null)
            throw new Error('Test not only supports null'); this.filters.push(`${this.field(key)} is not null`); return this; }
        order(key: string, options: any = {}) { this.ordering = ` order by ${quote(key)} ${options.ascending === false ? 'desc' : 'asc'}`; return this; }
        limit(n: number) { this.take = ` limit ${Number(n)}`; return this; }
        maybeSingle() { this.cardinality = 'maybe'; return this; }
        single() { this.cardinality = 'one'; return this; }
        insert(value: any) { this.verb = 'insert'; this.values = value; return this; }
        upsert(value: any, options: any = {}) { this.verb = 'upsert'; this.values = value; this.options = options; return this; }
        update(value: any) { this.verb = 'update'; this.values = value; return this; }
        delete() { this.verb = 'delete'; return this; }
        private async execute() {
            try {
                const table = `public.${quote(this.table)}`, where = this.filters.length ? ` where ${this.filters.join(' and ')}` : '', columns = this.columns === '*' ? '*' : this.columns.split(',').map(quote).join(',');
                let sql = '';
                if (this.verb === 'select')
                    sql = `select ${this.count ? 'count(*)::int as count' : columns} from ${table}${where}${this.count ? '' : this.ordering + this.take}`;
                else if (this.verb === 'delete')
                    sql = `delete from ${table}${where}`;
                else if (this.verb === 'update')
                    sql = `update ${table} set ${Object.entries(this.values).map(([key, value]) => `${quote(key)}=${this.bind(value)}`).join(',')}${where}`;
                else {
                    const rows = Array.isArray(this.values) ? this.values : [this.values], keys = Object.keys(rows[0]);
                    sql = `insert into ${table}(${keys.map(quote).join(',')}) values ${rows.map(row => `(${keys.map(key => this.bind(row[key])).join(',')})`).join(',')}`;
                    if (this.verb === 'upsert') {
                        sql += ` on conflict(${this.options.onConflict.split(',').map(quote).join(',')}) `;
                        sql += this.options.ignoreDuplicates ? 'do nothing' : `do update set ${keys.map(key => `${quote(key)}=excluded.${quote(key)}`).join(',')}`;
                    }
                }
                if (this.verb !== 'select' && this.returning)
                    sql += ` returning ${columns}`;
                const result = await db.query(sql, this.params as any[]);
                if (this.count)
                    return { data: null, count: (result.rows[0] as any).count, error: null };
                if (this.cardinality === 'one' && result.rows.length !== 1)
                    throw new Error(`Expected one ${this.table} row; got ${result.rows.length}`);
                return { data: this.head ? null : this.cardinality === 'many' ? result.rows : result.rows[0] || null, error: null };
            }
            catch (error) {
                return { data: null, error };
            }
        }
        then<TResult1 = any, TResult2 = never>(yes?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, no?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(yes, no); }
    }
    return { from: (table: string) => new Query(table), rpc: async (name: string, args: Record<string, unknown> = {}) => { try {
            const entries = Object.entries(args), invocation = `public.${quote(name)}(${entries.map(([key], i) => `${quote(key)}=>$${i + 1}`).join(',')})`, sql = ['revision_claim_jobs', 'revision_gc', 'revision_gc_assets'].includes(name) ? `select to_jsonb(value) result from ${invocation} value` : `select ${invocation} result`;
            const result = await db.query<{
                result: any;
            }>(sql, entries.map(([, value]) => value) as any[]);
            return { data: ['revision_claim_jobs', 'revision_gc', 'revision_gc_assets'].includes(name) ? result.rows.map(row => row.result) : result.rows[0]?.result, error: null };
        }
        catch (error) {
            return { data: null, error };
        } } };
}
