import test from 'node:test';
import assert from 'node:assert/strict';
import { SparseMatrix } from '../dist/esm/index.js';
const e = (row, column, value) => ({ row, column, value });
test('COO canonicalization sums duplicates, removes zeros, sorts columns', () => {
  const m = new SparseMatrix(2, 3, [e(1, 2, 7), e(0, 2, 2), e(0, 0, 1), e(0, 2, -2)]);
  assert.deepEqual(m.toCSR(), { rowOffsets: [0, 1, 2], columnIndices: [0, 2], values: [1, 7] });
  assert.equal(m.get(0, 2), 0);
  assert.equal(m.nonZeros, 2);
  assert.deepEqual(m.toCOO(), [e(0, 0, 1), e(1, 2, 7)]);
});
test('duplicate reject includes zero entries and last policy can erase cells', () => {
  assert.throws(
    () => new SparseMatrix(1, 1, [e(0, 0, 0), e(0, 0, 2)], { duplicates: 'reject' }),
    /Duplicate/,
  );
  assert.equal(
    new SparseMatrix(1, 1, [e(0, 0, 2), e(0, 0, 0)], { duplicates: 'last' }).nonZeros,
    0,
  );
  assert.throws(() => new SparseMatrix(1, 1, [], { duplicates: 'bad' }));
});
test('CSR validates offsets, canonical columns, values, holes and all coordinates', () => {
  const good = { rowOffsets: [0, 2], columnIndices: [0, 2], values: [1, 3] };
  assert.equal(SparseMatrix.fromCSR(1, 3, good).get(0, 2), 3);
  const bad = [
    { ...good, rowOffsets: [1, 2] },
    { ...good, rowOffsets: [0, 3] },
    { ...good, columnIndices: [2, 0] },
    { ...good, columnIndices: [0, 0] },
    { ...good, columnIndices: [0, 3] },
    { ...good, values: [1, 0] },
    { ...good, values: [1, Infinity] },
    { ...good, values: new Array(2) },
    { ...good, columnIndices: new Array(2) },
    { ...good, rowOffsets: new Array(2) },
    { rowOffsets: [0, 2, 1, 2], columnIndices: [0, 1], values: [1, 1] },
  ];
  for (const csr of bad)
    assert.throws(() => SparseMatrix.fromCSR(csr.rowOffsets.length - 1, 3, csr));
  assert.throws(() => new SparseMatrix(2, 2, new Array(1)));
  for (const entry of [
    e(-1, 0, 1),
    e(2, 0, 1),
    e(0, 2, 1),
    e(0.5, 0, 1),
    e(0, NaN, 1),
    e(0, 0, NaN),
  ])
    assert.throws(() => new SparseMatrix(2, 2, [entry]));
});
test('transpose and input/output ownership; zero-dimensional shapes', () => {
  const entries = [e(0, 1, 4)],
    m = new SparseMatrix(2, 3, entries);
  entries[0].value = 9;
  m.toCSR().values[0] = 100;
  m.toCOO()[0].column = 0;
  assert.equal(m.get(0, 1), 4);
  const t = m.transpose();
  assert.equal(t.rows, 3);
  assert.equal(t.columns, 2);
  assert.equal(t.get(1, 0), 4);
  assert.deepEqual(t.transpose().toCSR(), m.toCSR());
  assert.deepEqual(new SparseMatrix(0, 3).transpose().toCSR().rowOffsets, [0, 0, 0, 0]);
});
test('finite overflow is explicit in duplicate sums and products without mutation', () => {
  const max = Number.MAX_VALUE;
  assert.throws(() => new SparseMatrix(1, 1, [e(0, 0, max), e(0, 0, max)]), /overflow/);
  const a = new SparseMatrix(1, 2, [e(0, 0, max), e(0, 1, max)]);
  const b = new SparseMatrix(2, 1, [e(0, 0, 1), e(1, 0, 1)]);
  assert.throws(() => a.multiply(b), /overflow/);
  assert.throws(
    () => new SparseMatrix(1, 1, [e(0, 0, max)]).multiply(new SparseMatrix(1, 1, [e(0, 0, 2)])),
    /overflow/,
  );
  assert.equal(a.get(0, 0), max);
  assert.equal(b.nonZeros, 2);
});
test('exact input/nonzero/dimension/work budgets and mismatched shapes reject', () => {
  const a = new SparseMatrix(1, 1, [e(0, 0, 2)], {
    maxDimension: 1,
    maxInputEntries: 1,
    maxNonZeros: 1,
  });
  assert.equal(a.multiply(a, { maxOperations: 1, maxNonZeros: 1 }).get(0, 0), 4);
  assert.throws(() => a.multiply(a, { maxOperations: 0 }));
  assert.throws(() => a.multiply(a, { maxNonZeros: 0 }));
  assert.throws(() => a.multiply(new SparseMatrix(2, 1)));
  assert.throws(() => new SparseMatrix(2, 1, [], { maxDimension: 1 }));
  assert.throws(() => new SparseMatrix(1, 1, [e(0, 0, 0)], { maxInputEntries: 0 }));
  assert.throws(() => new SparseMatrix(1, 1, [e(0, 0, 1)], { maxNonZeros: 0 }));
  for (const rows of [-1, 0.5, NaN, 1_000_001]) assert.throws(() => new SparseMatrix(rows, 1));
  assert.throws(() => a.get(1, 0));
  assert.throws(() => a.get(0, -1));
});
test('seeded dense independent oracle for COO sum, transpose and multiplication', () => {
  let seed = 356;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 8;
  };
  for (let trial = 0; trial < 120; trial++) {
    const rows = 1 + (random() % 6),
      inner = 1 + (random() % 6),
      cols = 1 + (random() % 6);
    const dense = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
    const a = dense(rows, inner),
      b = dense(inner, cols),
      ac = [],
      bc = [];
    for (let i = 0; i < 40; i++) {
      const r = random() % rows,
        k = random() % inner,
        c = random() % cols,
        x = (random() % 9) - 4,
        y = (random() % 9) - 4;
      a[r][k] += x;
      b[k][c] += y;
      ac.push(e(r, k, x));
      bc.push(e(k, c, y));
    }
    const am = new SparseMatrix(rows, inner, ac),
      bm = new SparseMatrix(inner, cols, bc),
      product = am.multiply(bm),
      transposed = am.transpose();
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < inner; k++) {
        assert.equal(am.get(r, k), a[r][k]);
        assert.equal(transposed.get(k, r), a[r][k]);
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let expected = 0;
        for (let k = 0; k < inner; k++) expected += a[r][k] * b[k][c];
        assert.equal(product.get(r, c), expected);
      }
    assert.deepEqual(SparseMatrix.fromCSR(rows, inner, am.toCSR()).toCOO(), am.toCOO());
  }
});
