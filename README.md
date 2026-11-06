# @lp-labs/sparse-matrix

Immutable finite numeric sparse matrices: validated COO/CSR import, canonical CSR storage, transpose and budgeted sparse multiplication.

## Install

```sh
npm install @lp-labs/sparse-matrix
```

Version 0.1.0. MIT. Zero runtime, peer, or sibling dependencies. Node >=18;
browser-compatible ES2022 runtime without browser-global reads. ESM and CommonJS
exports have separate matching declarations.

## Quick start

```js
import { SparseMatrix } from '@lp-labs/sparse-matrix';
const a = new SparseMatrix(2, 2, [
  { row: 0, column: 1, value: 3 },
  { row: 1, column: 0, value: 2 },
]);
const product = a.multiply(a, { maxOperations: 2, maxNonZeros: 2 });
if (product.get(0, 0) !== 6) throw new Error('product');
console.log(product.toCSR()); // diagonal 6, 6
```

## Contract, customization, errors and ownership

Dimensions rows/columns are nonnegative integers; zero-dimensional shapes are valid. MatrixOptions defaults: maxDimension 1,000,000 (hard ceiling also 1,000,000), maxInputEntries 1,000,000, maxNonZeros 100,000, duplicates 'sum'. Budgets are nonnegative safe integers; dimension is additionally capped. COO entries require integer coordinates strictly inside the shape and finite values. Sparse arrays/holes, out-of-bounds/fractional coordinates and nonfinite values are rejected, never silently skipped.

COO duplicates are processed in input order: sum adds (checking every intermediate), last overwrites, reject throws TypeError on ANY repeated coordinate, including zeros. Final zeros/-0 are omitted from storage. Input-entry budget counts all raw records, even canceled/zero entries. Nonzero budget counts final canonical cells. Canonical CSR has rows+1 nondecreasing integer offsets starting 0 and ending at nnz, equal-length index/value arrays, strictly ascending in-bounds columns per row, and finite NONZERO values. `fromCSR` rejects malformed/noncanonical arrays rather than sorting/merging them. Arrays are ordinary number arrays, not typed arrays. Imported and exported arrays/entry wrappers are copied.

`get` returns zero for an absent valid coordinate, RangeError for invalid coordinates. `toCOO/toCSR` return row-major canonical snapshots. `transpose` preserves nonzeros and budgets its internal import exactly to that count. `multiply(right, options)` requires this.columns === right.rows; returns a new immutable matrix, never mutating operands. MultiplyOptions defaults: maxOperations 1,000,000 scalar products, maxNonZeros 100,000 final nonzero cells. Exact budgets succeed; one additional operation/cell throws RangeError. Canceled products still count toward operations. Each row accumulates via a sparse Map; zero results are omitted.

All numeric input, duplicate-sum, scalar-product and accumulation overflow/NaN throw RangeError. Malformed CSR structure/order or duplicate-reject policy violations throw TypeError. IEEE-754 rounding remains; this is not symbolic/exact arithmetic. Constructor failures and multiplication failures expose no partially built result.

COO construction O(input + rows + sum per-row sorting), memory O(rows + raw distinct cells). get O(log rowNNZ). Export O(rows + nnz). Transpose currently reimports COO and sorts, not a linear-time counting transpose. Multiplication cost is scalar-product work plus row-map and result sorting; budget bounds arithmetic work and intermediate columns, not wall-clock time. No dense materialization, solver, mutation, sibling dependencies or BLAS backend.

## Complete public declaration contract

Runtime exports and all exported types are listed below. Internal storage members
are omitted. Optional settings are constructor/function options, not globals.

```ts
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
export declare class SparseMatrix {
  readonly rows: number;
  readonly columns: number;
  constructor(
    rows: number,
    columns: number,
    entries?: readonly MatrixEntry[],
    options?: MatrixOptions,
  );
  static fromCSR(
    rows: number,
    columns: number,
    csr: CsrData,
    options?: MatrixOptions,
  ): SparseMatrix;
  get nonZeros(): number;
  get(row: number, column: number): number;
  toCSR(): CsrData;
  toCOO(): MatrixEntry[];
  transpose(): SparseMatrix;
  multiply(right: SparseMatrix, options?: MultiplyOptions): SparseMatrix;
}
```

## Development

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

TypeScript ^5.9.3 and Prettier ^3.6.2 are development-only. Offline installation
requires their locked packages already in the local npm cache. Build emits
dist/esm and dist/cjs with separate declarations; tests exercise runtime behavior
and bare-package ESM/CommonJS type consumers with negative checks. No publish
step is needed to build or test.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
