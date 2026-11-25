import fs from "fs";
import assert from "assert";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;

const src = fs.readFileSync(ROOT + "background/translationService.js", "utf8");
const m = src.match(/static extractSid\(text\) \{\n\s*const match = (\/.*\/i)\.exec\(text\);/);
assert.ok(m, "extractSid not found in source");
const re = eval(m[1]);
const extract = text => { const r = re.exec(text); return r ? r[1] : null; };

// Forms the page has used, plus variants that should still work.
assert.strictEqual(extract("var a = {sid: '1748123456.34a6b2.cd5e'};"), "1748123456.34a6b2.cd5e", "original form");
assert.strictEqual(extract("x={sid:'1748123456.34a6b2'}"), "1748123456.34a6b2", "no spaces");
assert.strictEqual(extract('{"sid": "1748123456.34a6b2"}'), "1748123456.34a6b2", "json double quotes");
assert.strictEqual(extract("SID: 'ABCDEF12.9988'"), "ABCDEF12.9988", "uppercase key");
assert.strictEqual(extract("sid : 'abc12345_xyz-9'"), "abc12345_xyz-9", "space before colon and _ -");
// Must not pick up a different key that ends in sid.
assert.strictEqual(extract("session_sid: 'aaaaaaaaaa'"), null, "word before sid rejected");
// Too short to be a session id.
assert.strictEqual(extract("sid: 'short'"), null, "too short rejected");
assert.strictEqual(extract("no session here"), null, "absent");
// Picks the first valid match.
assert.strictEqual(extract("sid: 'aaaaaaaa1'; sid: 'bbbbbbbb2'"), "aaaaaaaa1", "first match");
console.log("sid checks passed");
