import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestnetOriginCheck } from "./pi-testnet-preview-origin.js";

const currentPreview = "https://demo-kzmpbl6a30a2bigtxrna.vusercontent.net";
const nextPreview = "https://demo-newbuild42.vusercontent.net";
const appMetadata = '<script>self.__next_f.push(["\\"id\\":\\"6a565f08c5dfa5639ed4868d\\""])</script>';
const frame = (origin) => `<iframe title="PiNet" src="${origin}/?preview=opaque"></iframe>`;

test("allows the registered frontend and tracks the exact Access App frame across uploads", async () => {
  let now = 0;
  let preview = currentPreview;
  let reads = 0;
  const check = createTestnetOriginCheck(async (url) => {
    reads++;
    assert.equal(url, "https://apppiconnectuvr9006.pinet.com/");
    return new Response(appMetadata + frame(preview));
  }, () => now);

  assert.equal(await check("https://one-connect-git-develop-musabkorchachs-projects.vercel.app"), true);
  assert.equal(await check("https://oneconnect1066.pinet.com"), false);
  assert.equal(await check("https://apppiconnectuvr9006.pinet.com"), false);
  assert.equal(await check(undefined), false);
  assert.equal(reads, 0);
  assert.deepEqual(await Promise.all([check(currentPreview), check(nextPreview)]), [true, false]);
  assert.equal(reads, 1);
  preview = nextPreview;
  now += 30_001;
  assert.deepEqual(await Promise.all([check(currentPreview), check(nextPreview)]), [false, true]);
  assert.equal(reads, 2);
});

test("fails closed for an unrelated app, ambiguous frames, and a failed refresh", async () => {
  for (const page of [
    frame(currentPreview),
    appMetadata + frame(currentPreview) + frame(nextPreview),
    appMetadata + frame(currentPreview + ".example"),
    appMetadata + `<!--${frame(currentPreview)}-->`,
  ]) {
    const check = createTestnetOriginCheck(async () => new Response(page));
    assert.equal(await check(currentPreview), false);
  }

  let now = 0;
  const check = createTestnetOriginCheck(async () => now === 0
    ? new Response(appMetadata + frame(currentPreview)) : new Response("", { status: 503 }), () => now);
  assert.equal(await check(currentPreview), true);
  now += 30_001;
  assert.equal(await check(currentPreview), false);
});
