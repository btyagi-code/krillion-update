const assert = require("assert");
const L = require("./logic.js");
const { PROMPTS } = require("./data.js");
const p = id => PROMPTS.find(x => x.id === id);
const m = (id, g) => L.matchGuess(p(id), g);
assert.equal(m("fruit","apple").status, "exact");
assert.equal(m("fruit","Rambutn").status, "typo");
assert.equal(m("fruit","Rambutn").answer.name, "Rambutan");
assert.equal(m("sea","sea donkey").answer.name, "Sheephead");
assert.equal(m("space","ia").status, "none");           // short words: no typo forgiveness
assert.equal(m("dog","great").status, "vague");          // one word of a multi-word answer
assert.equal(m("dog","retriever").status, "vague");
assert.equal(m("language","c++").answer.name, "C++");
assert.equal(m("language","c#").answer.name, "C#");
assert.equal(m("dinosaur","T-Rex").answer.name, "Tyrannosaurus");
assert.equal(L.tierFor(m("fruit","durian").answer).key, "clever");
assert.equal(L.tierFor(m("fruit","salak").answer).key, "krillion");
assert.equal(L.tierFor(m("fruit","apple").answer).key, "plankton");
assert.deepEqual(L.dailyPrompts(PROMPTS,"2026-11-19").map(x=>x.id), L.dailyPrompts(PROMPTS,"2026-11-19").map(x=>x.id));
assert.equal(L.depthFor(700), 10935);
// every prompt has at least one krillion-tier answer and one clever trap
for (const pr of PROMPTS) {
  const tiers = L.expand(pr).map(a => L.tierFor(a).key);
  assert(tiers.includes("krillion"), pr.id + " no krillion");
  assert(tiers.includes("clever"), pr.id + " no clever");
}
console.log("all tests passed;", PROMPTS.length, "prompts");
// phonetic (sound-alike) matching
assert.equal(m("dinosaur","kosmoseratops").answer.name, "Kosmoceratops");
assert.equal(m("dinosaur","kosmoseratops").status, "typo");          // still needs a confirm
assert.equal(m("dog","zolo").status, "none");                        // too short for phonetic
assert.equal(m("gem","jeremeyevite").answer.name, "Jeremejevite");
assert.equal(m("sea","sifonofore").answer.name, "Siphonophore");
assert.equal(m("fruit","jim").status, "none");
assert.equal(m("fruit","james").status, "none");                     // the "James method" gets nothing
console.log("phonetic tests passed");
// regression: common words must not sound-alike their way into rare answers
for (const [id, w] of [["eucapital","photos"],["eucapital","followed"],["africa","commerce"],["africa","justin"],
  ["boardgame","senate"],["gem","beneath"],["pasta","drive"],["bird","bought"],["language","friday"]])
  assert.notEqual(m(id, w).status, "typo", `${w} should not match in ${id}`);
console.log("anti-exploit regression passed");
