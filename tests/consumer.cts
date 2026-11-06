import {
  SparseMatrix,
  type MatrixEntry,
  type CsrData,
  type MatrixOptions,
  type MultiplyOptions,
} from '@lp-labs/sparse-matrix';
const entries: MatrixEntry[] = [{ row: 0, column: 0, value: 2 }];
const options: MatrixOptions = { duplicates: 'reject', maxNonZeros: 1 };
const matrix = new SparseMatrix(1, 1, entries, options);
const csr: CsrData = matrix.toCSR();
const work: MultiplyOptions = { maxOperations: 1 };
const result: SparseMatrix = matrix.multiply(matrix, work);
// @ts-expect-error invalid duplicate policy
new SparseMatrix(1, 1, [], { duplicates: 'merge' });
// @ts-expect-error numeric value required
new SparseMatrix(1, 1, [{ row: 0, column: 0, value: '2' }]);
void [csr, result];
