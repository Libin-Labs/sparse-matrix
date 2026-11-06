export interface MatrixEntry {
  row: number;
  column: number;
  value: number;
}
export interface CsrData {
  rowOffsets: readonly number[];
  columnIndices: readonly number[];
  values: readonly number[];
}
export interface MatrixOptions {
  maxDimension?: number;
  maxInputEntries?: number;
  maxNonZeros?: number;
  duplicates?: 'sum' | 'last' | 'reject';
}
export interface MultiplyOptions {
  maxOperations?: number;
  maxNonZeros?: number;
}
function budget(value: number, ceiling = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > ceiling)
    throw new RangeError('Invalid matrix budget');
  return value;
}
function finite(value: number): number {
  if (!Number.isFinite(value))
    throw new RangeError('Nonfinite matrix value or arithmetic overflow');
  return value;
}
export class SparseMatrix {
  readonly rows: number;
  readonly columns: number;
  private readonly offsets: number[];
  private readonly indices: number[];
  private readonly values: number[];
  constructor(
    rows: number,
    columns: number,
    entries: readonly MatrixEntry[] = [],
    options: MatrixOptions = {},
  ) {
    const dimension = budget(options.maxDimension ?? 1_000_000, 1_000_000);
    this.rows = budget(rows, dimension);
    this.columns = budget(columns, dimension);
    const inputLimit = budget(options.maxInputEntries ?? 1_000_000),
      outputLimit = budget(options.maxNonZeros ?? 100_000);
    const duplicates = options.duplicates ?? 'sum';
    if (!['sum', 'last', 'reject'].includes(duplicates))
      throw new TypeError('Invalid duplicate policy');
    if (!Array.isArray(entries) || entries.length > inputLimit)
      throw new RangeError('Input entry budget exceeded');
    const cells = new Map<number, Map<number, number>>();
    for (const entry of entries) {
      if (
        !entry ||
        !Number.isSafeInteger(entry.row) ||
        entry.row < 0 ||
        entry.row >= rows ||
        !Number.isSafeInteger(entry.column) ||
        entry.column < 0 ||
        entry.column >= columns
      )
        throw new RangeError('COO coordinate out of bounds');
      finite(entry.value);
      let row = cells.get(entry.row);
      if (!row) {
        row = new Map();
        cells.set(entry.row, row);
      }
      if (row.has(entry.column) && duplicates === 'reject')
        throw new TypeError('Duplicate COO coordinate');
      row.set(
        entry.column,
        duplicates === 'sum' ? finite((row.get(entry.column) ?? 0) + entry.value) : entry.value,
      );
    }
    this.offsets = [0];
    this.indices = [];
    this.values = [];
    for (let r = 0; r < rows; r++) {
      for (const [column, value] of [...(cells.get(r) ?? [])].sort((a, b) => a[0] - b[0])) {
        if (value === 0) continue;
        if (this.values.length === outputLimit) throw new RangeError('Nonzero budget exceeded');
        this.indices.push(column);
        this.values.push(value);
      }
      this.offsets.push(this.values.length);
    }
  }
  static fromCSR(
    rows: number,
    columns: number,
    csr: CsrData,
    options: MatrixOptions = {},
  ): SparseMatrix {
    const dimension = budget(options.maxDimension ?? 1_000_000, 1_000_000);
    budget(rows, dimension);
    budget(columns, dimension);
    if (
      !csr ||
      !Array.isArray(csr.rowOffsets) ||
      !Array.isArray(csr.columnIndices) ||
      !Array.isArray(csr.values) ||
      csr.rowOffsets.length !== rows + 1 ||
      csr.values.length !== csr.columnIndices.length ||
      csr.rowOffsets[0] !== 0 ||
      csr.rowOffsets[rows] !== csr.values.length
    )
      throw new TypeError('Malformed CSR arrays');
    const maximum = budget(options.maxInputEntries ?? 1_000_000);
    if (csr.values.length > maximum) throw new RangeError('Input entry budget exceeded');
    const entries: MatrixEntry[] = [];
    for (let row = 0; row < rows; row++) {
      const start = csr.rowOffsets[row]!,
        end = csr.rowOffsets[row + 1]!;
      budget(start, csr.values.length);
      budget(end, csr.values.length);
      if (end < start) throw new TypeError('Decreasing CSR offsets');
      let last = -1;
      for (let i = start; i < end; i++) {
        const column = csr.columnIndices[i]!,
          value = csr.values[i]!;
        if (!Number.isSafeInteger(column) || column <= last || column >= columns || value === 0)
          throw new TypeError('CSR requires strictly ascending columns and nonzero values');
        finite(value);
        last = column;
        entries.push({ row, column, value });
      }
    }
    return new SparseMatrix(rows, columns, entries, { ...options, duplicates: 'reject' });
  }
  get nonZeros(): number {
    return this.values.length;
  }
  get(row: number, column: number): number {
    if (
      !Number.isSafeInteger(row) ||
      row < 0 ||
      row >= this.rows ||
      !Number.isSafeInteger(column) ||
      column < 0 ||
      column >= this.columns
    )
      throw new RangeError('Coordinate out of bounds');
    let low = this.offsets[row]!,
      high = this.offsets[row + 1]!;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.indices[mid]! < column) low = mid + 1;
      else high = mid;
    }
    return low < this.offsets[row + 1]! && this.indices[low] === column ? this.values[low]! : 0;
  }
  toCSR(): CsrData {
    return {
      rowOffsets: [...this.offsets],
      columnIndices: [...this.indices],
      values: [...this.values],
    };
  }
  toCOO(): MatrixEntry[] {
    const entries: MatrixEntry[] = [];
    for (let row = 0; row < this.rows; row++)
      for (let i = this.offsets[row]!; i < this.offsets[row + 1]!; i++)
        entries.push({ row, column: this.indices[i]!, value: this.values[i]! });
    return entries;
  }
  transpose(): SparseMatrix {
    return new SparseMatrix(
      this.columns,
      this.rows,
      this.toCOO().map(({ row, column, value }) => ({ row: column, column: row, value })),
      { maxInputEntries: this.nonZeros, maxNonZeros: this.nonZeros },
    );
  }
  multiply(right: SparseMatrix, options: MultiplyOptions = {}): SparseMatrix {
    if (!(right instanceof SparseMatrix) || this.columns !== right.rows)
      throw new RangeError('Incompatible matrix dimensions');
    const maxOperations = budget(options.maxOperations ?? 1_000_000),
      maxNonZeros = budget(options.maxNonZeros ?? 100_000);
    let operations = 0;
    const entries: MatrixEntry[] = [];
    for (let row = 0; row < this.rows; row++) {
      const sums = new Map<number, number>();
      for (let i = this.offsets[row]!; i < this.offsets[row + 1]!; i++) {
        const k = this.indices[i]!;
        for (let j = right.offsets[k]!; j < right.offsets[k + 1]!; j++) {
          if (operations === maxOperations)
            throw new RangeError('Multiplication operation budget exceeded');
          operations++;
          const column = right.indices[j]!,
            product = finite(this.values[i]! * right.values[j]!);
          sums.set(column, finite((sums.get(column) ?? 0) + product));
        }
      }
      for (const [column, value] of sums) {
        if (value === 0) continue;
        if (entries.length === maxNonZeros) throw new RangeError('Product nonzero budget exceeded');
        entries.push({ row, column, value });
      }
    }
    return new SparseMatrix(this.rows, right.columns, entries, {
      maxInputEntries: maxNonZeros,
      maxNonZeros,
    });
  }
}
