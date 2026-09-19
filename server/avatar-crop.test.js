const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const crop = require("../app/avatar-crop");

test("avatar crop math keeps the selected circle inside landscape and portrait images", () => {
  const browserContext = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../app/avatar-crop.js"), "utf8"),
    browserContext,
  );

  for (const api of [crop, browserContext.window.MayakAvatarCrop]) {
    const landscape = api.create({
      sourceWidth: 1200,
      sourceHeight: 800,
      viewport: 320,
    });
    assert.deepEqual(
      Object.values(api.sourceRect(landscape)).map(Math.round),
      [200, 0, 800],
    );

    const movedToEdge = api.move(landscape, 10000, -10000);
    assert.equal(movedToEdge.panX, movedToEdge.maxPanX);
    assert.equal(movedToEdge.panY, 0);
    assert.deepEqual(
      Object.values(api.sourceRect(movedToEdge)).map(Math.round),
      [0, 0, 800],
    );

    const zoomed = api.setZoom(landscape, 2);
    assert.deepEqual(
      Object.values(api.sourceRect(zoomed)).map(Math.round),
      [400, 200, 400],
    );

    const portrait = api.create({
      sourceWidth: 600,
      sourceHeight: 1000,
      viewport: 300,
    });
    assert.deepEqual(
      Object.values(api.sourceRect(portrait)).map(Math.round),
      [0, 200, 600],
    );
    assert.equal(api.setZoom(portrait, 99).zoom, 3);
    assert.equal(api.setZoom(portrait, 0).zoom, 1);
  }
});
