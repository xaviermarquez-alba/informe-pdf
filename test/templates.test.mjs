import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripContentBackgrounds } from '../dist/index.js';

test('strips pasted backgrounds and span spell-check borders, keeps other styles', () => {
  const html =
    '<p style="background-color:yellow;text-align:center"><span class="ContextualSpellingAndGrammarError" style="background-image:url(&quot;data:image/gif;base64,AA==&quot;);border-bottom:1px solid transparent;font-weight:bold">mediastinales.-</span></p>' +
    '<td bgcolor="#ff0" style="border:1px solid #000;background:red">x</td>';
  const out = stripContentBackgrounds(html);
  assert.equal(
    out,
    '<p style="text-align:center"><span class="ContextualSpellingAndGrammarError" style="font-weight:bold">mediastinales.-</span></p>' +
      '<td style="border:1px solid #000">x</td>'
  );
});
