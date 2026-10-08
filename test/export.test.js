import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell,reviewsCsv } from '../src/lib/helpers.js';
test('exports quote separators and guard spreadsheet formulas while preserving zero estimates',()=>{
  assert.equal(csvCell('a,"b"'),'"a,""b"""');
  assert.equal(csvCell(' =HYPERLINK("x")'),'"\' =HYPERLINK(""x"")"');
  const csv=reviewsCsv([{title:'First',estimateHours:0,assignees:['A','B'],status:'Open',projectId:'p1'}]);
  assert.match(csv,/"Estimate hours"/);assert.match(csv,/"A; B"/);assert.match(csv,/"0","No"/);
});
