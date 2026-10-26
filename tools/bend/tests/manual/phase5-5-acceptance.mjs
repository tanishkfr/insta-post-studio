import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.BEND_ACCEPT_PORT ?? "4197");
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = path.resolve("output/evidence/phase5-5");
const mediaDirectory = path.join(evidenceDirectory, "media");
const browserExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fixtures = {
  video: path.resolve("tests/fixtures/test-pattern.mp4"),
  videoShort: path.resolve("tests/fixtures/constant-30.mp4"),
  audio: path.resolve("tests/fixtures/test-pattern-audio.mp4"),
};

const selectedJourneys = new Set((process.env.BEND_ACCEPT_ONLY ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const wants = (name) => selectedJourneys.size === 0 || selectedJourneys.has(name);

const evidence = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: null,
  fixtures,
  journeys: {},
  performance: {},
  consoleErrors: [],
  pageErrors: [],
  consoleWarnings: [],
  artifacts: [],
  checks: {},
};

let server;
let browser;

function check(name, condition, detail = undefined) {
  evidence.checks[name] = Boolean(condition);
  if (!condition) throw new Error(`${name} failed${detail !== undefined ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

function record(name, value) {
  evidence[name] = value;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      if ((await fetch(`${baseUrl}/`)).ok) return;
    } catch {
      // Keep waiting for Vite.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not become ready.");
}

async function newJourneyPage(context, label) {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push({ journey: label, text: message.text() });
    if (message.type() === "warning") evidence.consoleWarnings.push({ journey: label, text: message.text() });
  });
  page.on("pageerror", (error) => evidence.pageErrors.push({ journey: label, stack: error.stack ?? error.message }));
  return page;
}

async function openStudio(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
  await page.locator(".canvas-frame canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Warming the GPU compositor…").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function capture(page, name, fullPage = true) {
  const output = path.join(evidenceDirectory, name);
  await page.screenshot({ path: output, fullPage });
  evidence.artifacts.push(path.relative(root, output));
  return output;
}

async function canvasHash(page) {
  const buffer = await page.locator("canvas[data-testid=editor-canvas]").screenshot();
  return createHash("sha1").update(buffer).digest("hex");
}

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
}

async function addGenerator(page, name) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name }).click();
  await page.waitForTimeout(850);
}

async function importVideo(page, file) {
  await page.getByLabel("Add local video").setInputFiles(file);
  await page.waitForTimeout(1500);
}

async function openTab(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForTimeout(350);
}

async function openDisclosure(page, title) {
  const details = page.locator("details.inspector-disclosure").filter({ has: page.locator("summary strong").filter({ hasText: new RegExp(`^${title}$`) }) });
  const open = await details.evaluate((element) => element.hasAttribute("open"));
  if (!open) await details.locator("summary").click();
  await page.waitForTimeout(250);
}

async function selectTimelineRow(page, index = 0) {
  await page.locator(".timeline-track").nth(index).locator(".track-label").click();
  await page.waitForTimeout(300);
}

async function scrubTo(page, seconds, duration = 8) {
  const scrubber = page.getByLabel("Timeline scrubber");
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Timeline scrubber is unavailable.");
  const fraction = Math.max(0, Math.min(1, seconds / duration));
  await page.mouse.click(box.x + Math.max(2, Math.min(box.width - 2, fraction * box.width)), box.y + 5);
  await page.waitForTimeout(350);
}

async function setScopedNumber(locator, value) {
  await locator.fill(String(value));
  await locator.press("Enter");
  await pageWait(locator);
}

async function pageWait(locator) {
  const page = locator.page();
  await page.waitForTimeout(250);
}

async function ensureAutoKey(page) {
  const button = page.getByRole("button", { name: "Auto-Key", exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
}

async function getProjects(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("bend-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("projects")) return [];
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.savedAt - a.savedAt));
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function getLatestProject(page) {
  const records = await getProjects(page);
  return records[0]?.project ?? null;
}

async function waitForSaved(page, predicate, label = "saved project", timeout = 30_000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeout) {
    latest = await getLatestProject(page);
    if (latest && predicate(latest)) return latest;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for ${label}. Latest project: ${latest ? JSON.stringify({ id: latest.id, layers: latest.layers?.length, name: latest.name }) : "none"}`);
}

async function writeLegacyProject(page) {
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("bend-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const record = await new Promise((resolve, reject) => {
        const transaction = database.transaction("projects", "readonly");
        const request = transaction.objectStore("projects").getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.savedAt - a.savedAt)[0]);
        request.onerror = () => reject(request.error);
      });
      const project = record.project;
      delete project.loop;
      project.layers.forEach((layer) => {
        delete layer.blendMode;
        delete layer.mask;
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("projects", "readwrite");
        transaction.objectStore("projects").put({ ...record, savedAt: Date.now(), revision: Date.now(), project });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
}

async function exportStill(page, file) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Still frame" }).click();
  await dialog.getByRole("button", { name: "Export PNG" }).click();
  await dialog.getByText(/Export complete/).waitFor({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  await download.saveAs(file);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(300);
  return file;
}

async function exportVideo(page, { rangeMode = "full", quality = "preview", seamless = false, file }) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export composition" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: rangeMode === "loop" ? /Loop \/ work range/ : /Full composition/ }).click();
  await dialog.getByRole("button", { name: /Preview/ }).click();
  if (seamless) await dialog.locator(".seamless-check input").check();
  const started = Date.now();
  await dialog.getByRole("button", { name: seamless ? /Export seamless loop/ : rangeMode === "loop" ? /Export range/ : /Export video/ }).click();
  await dialog.getByText(/Export complete/).waitFor({ timeout: 240_000 });
  const elapsedMs = Date.now() - started;
  const audioText = await dialog.locator(".export-audio-status").textContent().catch(() => "");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download bend-/ }).click();
  const download = await downloadPromise;
  await download.saveAs(file);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(300);
  return { file, elapsedMs, audioText: audioText ?? "" };
}

function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames", "-of", "json", file], { encoding: "utf8" }));
}

function extractFrame(file, time, output) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", file, "-frames:v", "1", output], { stdio: "ignore" });
  return output;
}

function ssim(first, second) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-i", first, "-i", second, "-lavfi", "ssim", "-f", "null", "-"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return Number((/All:([0-9.]+)/.exec(output)?.[1] ?? "0"));
}

async function journey(name, context, body) {
  const started = Date.now();
  evidence.journeys[name] = { status: "RUNNING", checks: [], error: null, elapsedMs: 0 };
  const page = await newJourneyPage(context, name);
  try {
    await body(page);
    const browserErrors = evidence.consoleErrors.filter((entry) => entry.journey === name);
    const pageErrors = evidence.pageErrors.filter((entry) => entry.journey === name);
    check(`${name}:noConsoleErrors`, browserErrors.length === 0, JSON.stringify(browserErrors.slice(0, 3)));
    check(`${name}:noPageErrors`, pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
    evidence.journeys[name].status = "PASS";
  } catch (error) {
    evidence.journeys[name].status = "FAIL";
    evidence.journeys[name].error = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    evidence.journeys[name].elapsedMs = Date.now() - started;
    await page.close().catch(() => undefined);
  }
}

async function journeyOne(page) {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    const p0 = await waitForSaved(page, (project) => project.layers.length === 1 && project.layers[0].kind === "procedural", "initial generator");
    const beforeGenerator = structuredClone(p0.layers[0].generator);
    await openTab(page, "Edit");
    await page.locator(".generator-variation summary").click();
    await page.locator(".generator-variation").getByLabel("Strength").selectOption("moderate");
    await page.locator(".generator-variation").getByLabel("Seed").fill("P5-J1-GEN");
    await page.locator(".generator-variation").getByRole("button", { name: "Vary", exact: true }).click();
    const p1 = await waitForSaved(page, (project) => JSON.stringify(project.layers[0].generator) !== JSON.stringify(beforeGenerator), "generator variation");
    const afterGenerator = p1.layers[0].generator;
    check("55-04:generatorVariationChanged", JSON.stringify(afterGenerator) !== JSON.stringify(beforeGenerator));
    check("55-04:generatorVariationKeepsIdentity", afterGenerator.seed === beforeGenerator.seed && afterGenerator.duration === beforeGenerator.duration, { before: beforeGenerator, after: afterGenerator });
    record("journey1GeneratorVariation", { before: beforeGenerator, after: afterGenerator });

    await page.getByRole("button", { name: "Undo" }).click();
    const variationUndone = await waitForSaved(page, (project) => JSON.stringify(project.layers[0].generator) === JSON.stringify(beforeGenerator), "variation undo");
    check("55-04:variationUndo", JSON.stringify(variationUndone.layers[0].generator) === JSON.stringify(beforeGenerator));
    await page.getByRole("button", { name: "Redo" }).click();
    const variationRedone = await waitForSaved(page, (project) => JSON.stringify(project.layers[0].generator) === JSON.stringify(afterGenerator), "variation redo");
    check("55-04:variationRedo", JSON.stringify(variationRedone.layers[0].generator) === JSON.stringify(afterGenerator));

    await openTab(page, "Effects");
    await page.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.locator(".effect-library-item").filter({ hasText: "Channel Delay" }).click();
    await page.locator(".temporal-stack-select").filter({ hasText: "Motion Echo" }).click();
    await page.waitForTimeout(300);
    await page.getByLabel("Set keyframe for Decay").click();
    await scrubTo(page, 1.5);
    await page.getByLabel("Decay value").fill("0.4");
    await page.waitForTimeout(500);
    const animated = await waitForSaved(page, (project) => project.layers[0].animation.tracks.some((track) => track.property.includes(".decay") && track.keyframes.length >= 2), "animated effect stack");

    await page.locator(".temporal-effects-section .variation-controls summary").click();
    await page.locator(".temporal-effects-section .variation-controls").getByLabel("Seed").fill("P5-J1-FX");
    await page.locator(".temporal-effects-section .variation-controls").getByRole("button", { name: /Vary stack/ }).click();
    await page.waitForTimeout(600);
    const varied = await waitForSaved(page, (project) => JSON.stringify(project.layers[0].effects) !== JSON.stringify(animated.layers[0].effects), "effect variation");

    const processedHash = await canvasHash(page);
    const compare = page.getByRole("button", { name: /Hold to compare original source/ });
    await compare.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0 });
    await page.waitForTimeout(900);
    const comparisonHash = await canvasHash(page);
    await capture(page, "01-compare-original.png");
    await compare.dispatchEvent("pointerup", { pointerId: 1, pointerType: "mouse", button: 0 });
    await page.waitForTimeout(900);
    const restoredHash = await canvasHash(page);
    check("55-01:compareShowsDifferentSource", comparisonHash !== processedHash, { processedHash, comparisonHash });
    check("55-01:compareRestoresEditedState", restoredHash === processedHash);

    await compare.focus();
    await page.keyboard.down(" ");
    await page.waitForTimeout(900);
    const keyboardComparisonHash = await canvasHash(page);
    await page.keyboard.up(" ");
    await page.waitForTimeout(900);
    const keyboardRestoredHash = await canvasHash(page);
    check("55-19:compareKeyboardEquivalent", keyboardComparisonHash === comparisonHash && keyboardRestoredHash === processedHash, { keyboardComparisonHash, keyboardRestoredHash, comparisonHash, processedHash });

    await page.getByRole("button", { name: "Copy stack" }).click();
    const clipboardText = await page.locator(".effect-clipboard-summary").textContent();
    check("55-02:clipboardExplainsAnimation", /animated track/.test(clipboardText ?? ""), clipboardText);

    await addGenerator(page, "Refraction");
    await openTab(page, "Effects");
    await page.getByRole("button", { name: "Paste replace" }).click();
    await page.waitForTimeout(700);
    const pasted = await waitForSaved(page, (project) => project.layers.length === 2 && project.layers.find((layer) => layer.name === "Refraction")?.effects.length === 2, "copied effect stack paste");
    const sourceLayer = pasted.layers.find((layer) => layer.name === "Signal Field");
    const targetLayer = pasted.layers.find((layer) => layer.name === "Refraction");
    check("55-02:targetStackReplaced", targetLayer?.effects.length === 2, targetLayer?.effects.length);
    const sourceIds = new Set(sourceLayer?.effects.map((effect) => effect.instanceId));
    const targetIds = new Set(targetLayer?.effects.map((effect) => effect.instanceId));
    check("55-03:freshEffectInstanceIds", [...targetIds].every((id) => !sourceIds.has(id)) && targetIds.size === 2, { sourceIds: [...sourceIds], targetIds: [...targetIds] });
    const targetTrack = targetLayer?.animation.tracks.find((track) => track.property.includes(".decay"));
    const targetEcho = targetLayer?.effects.find((effect) => effect.id === "motion-echo");
    check("55-03:animationRemappedToFreshId", Boolean(targetTrack && targetEcho && targetTrack.property.startsWith(`effects.${targetEcho.instanceId}.`)), targetTrack?.property);
    check("55-03:sourceAnimationIntact", sourceLayer?.animation.tracks.some((track) => track.property.includes(".decay") && track.keyframes.length >= 2));
    record("journey1Stacks", {
      sourceEffects: sourceLayer?.effects.map((effect) => ({ id: effect.id, instanceId: effect.instanceId })),
      targetEffects: targetLayer?.effects.map((effect) => ({ id: effect.id, instanceId: effect.instanceId })),
      targetTrack: targetTrack?.property,
    });

    const file = path.join(mediaDirectory, "journey1-variation.png");
    await exportStill(page, file);
    const probe = ffprobe(file);
    check("55-21:journey1PngExported", probe.streams?.[0]?.width === 1080 && probe.streams?.[0]?.height === 1350, probe);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const reopened = await waitForSaved(page, (project) => project.layers.length === 2 && project.layers.some((layer) => layer.effects.length === 2), "journey 1 reopen");
    check("55-16:journey1Persistence", reopened.layers.some((layer) => layer.effects.length === 2));
    await capture(page, "02-journey1-reopened.png");
}

async function journeyTwo(page) {
    await openStudio(page);
    await importVideo(page, fixtures.video);
    const initial = await waitForSaved(page, (project) => project.layers.length === 1 && project.layers[0].kind === "video", "video layer");
    const originalAssetId = initial.layers[0].assetId;
    await openTab(page, "Edit");
    await ensureAutoKey(page);
    await page.getByLabel("Scale value").first().fill("0.8");
    await page.getByLabel("Position X value").first().fill("40");
    await openTab(page, "Effects");
    await page.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await openTab(page, "Edit");
    await scrubTo(page, 1);
    await page.getByLabel("Position X value").first().fill("80");
    const treated = await waitForSaved(page, (project) => project.layers[0].animation.tracks.some((track) => track.property === "transform.x" && track.keyframes.length >= 2), "treated video");
    const treatedLayerId = treated.layers[0].id;

    await page.getByRole("button", { name: "Duplicate Imported footage" }).click();
    const duplicated = await waitForSaved(page, (project) => project.layers.length === 2, "duplicated video");
    const duplicatedLayerId = duplicated.layers.find((layer) => layer.id !== treatedLayerId)?.id;
    check("55-05:sharedSourceBeforeReplace", duplicated.layers.every((layer) => layer.assetId === originalAssetId));
    await selectTimelineRow(page, 0);

    await page.getByRole("button", { name: /Replace source/ }).click();
    await page.getByLabel("Choose new source footage").setInputFiles(fixtures.videoShort);
    const dialog = page.getByRole("dialog", { name: "Replace footage?" });
    await dialog.waitFor({ timeout: 30_000 });
    await capture(page, "03-replace-duration-policy.png");
    check("55-05:shortSourceDisablesPreserve", await dialog.getByRole("radio", { name: /Keep edit timing/ }).isDisabled());
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(500);
    const cancelled = await getLatestProject(page);
    check("55-05:replaceCancellationLeavesProject", cancelled.layers.find((layer) => layer.id === duplicatedLayerId)?.assetId === originalAssetId && Object.keys(cancelled.assets).length === Object.keys(initial.assets).length);

    await page.getByRole("button", { name: /Replace source/ }).click();
    await page.getByLabel("Choose new source footage").setInputFiles(fixtures.videoShort);
    const dialog2 = page.getByRole("dialog", { name: "Replace footage?" });
    await dialog2.waitFor({ timeout: 30_000 });
    await dialog2.getByRole("radio", { name: /Fit layer to new source/ }).check();
    await dialog2.getByRole("button", { name: "Replace footage", exact: true }).click();
    await page.waitForTimeout(800);
    const replaced = await waitForSaved(page, (project) => project.layers.find((layer) => layer.id === duplicatedLayerId)?.assetId !== originalAssetId, "source replacement");
    const replacedLayer = replaced.layers.find((layer) => layer.id === duplicatedLayerId);
    const untouchedLayer = replaced.layers.find((layer) => layer.id === treatedLayerId);
    check("55-05:replacementPreservesTreatment", (replacedLayer?.transform.scale === 0.8 || replacedLayer?.animation.tracks.some((track) => track.property === "transform.scale")) && replacedLayer.effects.length === 1 && replacedLayer.animation.tracks.some((track) => track.property === "transform.x" && track.keyframes.length >= 2), replacedLayer);
    check("55-05:replacementFitsDuration", Math.abs((replacedLayer?.timeline.duration ?? 0) - 1) < 0.01, replacedLayer?.timeline);
    check("55-05:sharedOriginalAssetPreserved", untouchedLayer?.assetId === originalAssetId && Boolean(replaced.assets[originalAssetId]), { untouchedAssetId: untouchedLayer?.assetId, originalAssetId });
    check("55-05:replacementUsesNewAsset", replacedLayer?.assetId && replacedLayer.assetId !== originalAssetId);
    record("journey2Replacement", {
      replacedLayer: { id: replacedLayer?.id, assetId: replacedLayer?.assetId, timeline: replacedLayer?.timeline, scale: replacedLayer?.transform.scale },
      untouchedLayer: { id: untouchedLayer?.id, assetId: untouchedLayer?.assetId, timeline: untouchedLayer?.timeline },
      assets: Object.keys(replaced.assets),
    });

    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(700);
    const undone = await waitForSaved(page, (project) => project.layers.find((layer) => layer.id === duplicatedLayerId)?.assetId === originalAssetId, "replace undo");
    check("55-05:undoRestoresSource", undone.layers.find((layer) => layer.id === duplicatedLayerId)?.timeline.duration === 2);
    await page.getByRole("button", { name: "Redo" }).click();
    await page.waitForTimeout(700);
    const redone = await waitForSaved(page, (project) => project.layers.find((layer) => layer.id === duplicatedLayerId)?.assetId !== originalAssetId, "replace redo");
    check("55-05:redoRestoresReplacement", Math.abs((redone.layers.find((layer) => layer.id === duplicatedLayerId)?.timeline.duration ?? 0) - 1) < 0.01);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const reopened = await waitForSaved(page, (project) => project.layers.some((layer) => layer.id === duplicatedLayerId && layer.timeline.duration < 1.1), "replacement reopen");
    check("55-16:journey2Persistence", Boolean(reopened.layers.find((layer) => layer.id === duplicatedLayerId)?.assetId));

    await selectTimelineRow(page, 0);
    const loopEnd = page.getByLabel("Loop end seconds");
    await loopEnd.fill("1");
    await loopEnd.press("Enter");
    const file = path.join(mediaDirectory, "journey2-replacement.mp4");
    const exported = await exportVideo(page, { rangeMode: "loop", quality: "preview", file });
    const probe = ffprobe(file);
    check("55-21:journey2VideoExported", Number(probe.format?.duration) > 0.9 && Number(probe.format?.duration) < 1.2, probe);
    record("journey2Export", { ...exported, probe });
    await capture(page, "04-journey2-reopened.png");
}

async function journeyThree(page) {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await addGenerator(page, "Refraction");
    await selectTimelineRow(page, 0);
    await openTab(page, "Edit");
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("multiply");
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
    await ensureAutoKey(page);
    await page.locator(".mask-section").getByLabel("Set keyframe for Position X").click();
    await scrubTo(page, 2);
    await page.locator(".mask-section").getByLabel("Position X value").fill("0.75");
    await page.locator(".mask-section").getByLabel("Feather value").fill("0.4");
    await page.waitForTimeout(700);
    const animated = await waitForSaved(page, (project) => project.layers.some((layer) => layer.mask.type === "ellipse" && layer.animation.tracks.some((track) => track.property === "mask.x" && track.keyframes.length >= 2)), "animated mask");
    await openTab(page, "Effects");
    await page.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.waitForTimeout(700);
    const effect = await waitForSaved(page, (project) => project.layers.some((layer) => layer.effects.length > 0), "masked temporal layer");
    await scrubTo(page, 0.2);
    const startHash = await canvasHash(page);
    await scrubTo(page, 2.6);
    const laterHash = await canvasHash(page);
    check("55-06:blendPersisted", effect.layers.some((layer) => layer.blendMode === "multiply"));
    check("55-07:ellipseMaskPersisted", effect.layers.some((layer) => layer.mask.type === "ellipse" && layer.mask.invert === false));
    check("55-08:maskAnimationChangesPreview", startHash !== laterHash, { startHash, laterHash });
    await capture(page, "05-mask-blend-composite.png");

    const ellipseHash = laterHash;
    await openTab(page, "Edit");
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Rect" }).click();
    await page.waitForTimeout(700);
    const rectangleHash = await canvasHash(page);
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Gradient" }).click();
    await page.waitForTimeout(700);
    const gradientHash = await canvasHash(page);
    await capture(page, "05b-mask-gradient.png");
    check("55-07:maskShapesDistinct", new Set([ellipseHash, rectangleHash, gradientHash]).size === 3, { ellipseHash, rectangleHash, gradientHash });
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
    await page.waitForTimeout(700);

    const previewStill = path.join(mediaDirectory, "journey3-preview.png");
    await page.locator("canvas[data-testid=editor-canvas]").screenshot({ path: previewStill });
    const png = path.join(mediaDirectory, "journey3-composite.png");
    await exportStill(page, png);
    const pngProbe = ffprobe(png);
    check("55-07:maskedStillExported", pngProbe.streams?.[0]?.width === 1080 && pngProbe.streams?.[0]?.height === 1350, pngProbe);
    const previewProbe = ffprobe(previewStill);
    const scaledExport = path.join(mediaDirectory, "journey3-export-scaled.png");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", png, "-vf", `scale=${previewProbe.streams[0].width}:${previewProbe.streams[0].height}`, scaledExport], { stdio: "ignore" });
    const previewExportSsim = ssim(previewStill, scaledExport);
    check("55-06:previewExportMatch", previewExportSsim > 0.9, previewExportSsim);
    record("journey3PreviewExportSsim", previewExportSsim);

    const video = path.join(mediaDirectory, "journey3-composite.mp4");
    const exported = await exportVideo(page, { rangeMode: "full", quality: "preview", file: video });
    const probe = ffprobe(video);
    check("55-06:blendMaskVideoExported", Number(probe.format?.duration) > 7.5, probe);
    record("journey3Export", { ...exported, probe });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const reopened = await waitForSaved(page, (project) => project.layers.some((layer) => layer.mask.type === "ellipse" && layer.blendMode === "multiply" && layer.animation.tracks.some((track) => track.property === "mask.x")), "masked project reopen");
    check("55-08:maskAnimationPersistence", Boolean(reopened));
    await capture(page, "06-journey3-reopened.png");
}

async function journeyFour(page) {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await openTab(page, "Edit");
    await ensureAutoKey(page);
    await page.getByLabel("Set keyframe for Position X").click();
    await scrubTo(page, 1);
    await page.getByLabel("Position X value").first().fill("100");
    await scrubTo(page, 2);
    await page.getByLabel("Position X value").first().fill("50");
    await page.waitForTimeout(700);
    const three = await waitForSaved(page, (project) => project.layers[0].animation.tracks.some((track) => track.property === "transform.x" && track.keyframes.length === 3), "three keyframes");
    const keysBefore = three.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.map((keyframe) => keyframe.time).sort((a, b) => a - b);
    check("55-09:threeKeyframesCreated", keysBefore.length === 3, keysBefore);

    const timelineKeys = page.locator(".timeline-keyframe");
    check("55-09:keyframesVisible", await timelineKeys.count() === 3, await timelineKeys.count());
    await timelineKeys.nth(0).click();
    await timelineKeys.nth(1).click({ modifiers: ["Shift"] });
    await timelineKeys.nth(2).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(300);
    check("55-09:groupSelection", await page.locator(".timeline-keyframe.is-selected").count() === 3);
    await page.getByRole("button", { name: "Copy selected keyframes" }).click();
    await scrubTo(page, 4);
    await page.getByRole("button", { name: "Paste keyframes at playhead" }).click();
    await page.waitForTimeout(700);
    const pasted = await waitForSaved(page, (project) => project.layers[0].animation.tracks.some((track) => track.property === "transform.x" && track.keyframes.length === 6), "group paste");
    const pastedTimes = pasted.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.map((keyframe) => keyframe.time).sort((a, b) => a - b);
    const pastedSpacing = pastedTimes.slice(3).slice(1).map((time, index) => Number((time - pastedTimes.slice(3)[index]).toFixed(3)));
    const originalSpacing = keysBefore.slice(1).map((time, index) => Number((time - keysBefore[index]).toFixed(3)));
    check("55-09:groupPastePreservesSpacing", JSON.stringify(pastedSpacing) === JSON.stringify(originalSpacing), { originalSpacing, pastedSpacing, pastedTimes });
    const pastedIds = pasted.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.map((keyframe) => keyframe.id);
    check("55-09:uniqueKeyframeIds", new Set(pastedIds).size === pastedIds.length);

    await page.getByRole("button", { name: "Undo" }).click();
    const afterUndo = await waitForSaved(page, (project) => project.layers[0].animation.tracks.find((track) => track.property === "transform.x")?.keyframes.length === 3, "keyframe paste undo");
    check("55-09:undoWholePaste", afterUndo.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.length === 3);
    await page.getByRole("button", { name: "Redo" }).click();
    const afterRedo = await waitForSaved(page, (project) => project.layers[0].animation.tracks.find((track) => track.property === "transform.x")?.keyframes.length === 6, "keyframe paste redo");
    check("55-09:redoWholePaste", afterRedo.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.length === 6);
    const keysAfterRedo = page.locator(".timeline-keyframe");
    await keysAfterRedo.nth(3).click();
    await keysAfterRedo.nth(4).click({ modifiers: ["Shift"] });
    await keysAfterRedo.nth(5).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(300);

    await openTab(page, "Motion");
    await page.getByRole("button", { name: "Snappy" }).click();
    await page.waitForTimeout(700);
    const eased = await waitForSaved(page, (project) => project.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").length === 3, "group easing");
    check("55-10:groupEasingApplied", eased.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").length === 3);
    await capture(page, "07-journey4-easing.png");

    const selectedKey = page.locator(".timeline-keyframe.is-selected").first();
    await selectedKey.focus();
    const beforeMoveTrack = (await getLatestProject(page)).layers[0].animation.tracks.find((track) => track.property === "transform.x");
    const selectedTimesBefore = beforeMoveTrack.keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").map((keyframe) => keyframe.time).sort((a, b) => a - b);
    await selectedKey.press("Shift+ArrowRight");
    await page.waitForTimeout(700);
    const moved = await waitForSaved(page, (project) => {
      const keyframes = project.layers[0].animation.tracks.find((track) => track.property === "transform.x").keyframes;
      const selectedTimes = keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").map((keyframe) => keyframe.time).sort((a, b) => a - b);
      return selectedTimes.some((time, index) => Math.abs(time - selectedTimesBefore[index]) > 0.5);
    }, "group keyboard move");
    const afterMoveTrack = moved.layers[0].animation.tracks.find((track) => track.property === "transform.x");
    const selectedTimesAfter = afterMoveTrack.keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").map((keyframe) => keyframe.time).sort((a, b) => a - b);
    const spacing = (times) => times.slice(1).map((time, index) => Number((time - times[index]).toFixed(3)));
    check("55-09:groupMovePreservesSpacing", JSON.stringify(spacing(selectedTimesBefore)) === JSON.stringify(spacing(selectedTimesAfter)), { before: selectedTimesBefore, after: selectedTimesAfter });
    const timesBeforeMove = beforeMoveTrack.keyframes.map((keyframe) => keyframe.time).sort((a, b) => a - b);
    const timesAfterMove = afterMoveTrack.keyframes.map((keyframe) => keyframe.time).sort((a, b) => a - b);
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Redo" }).click();
    await page.waitForTimeout(600);
    record("journey4Times", { before: timesBeforeMove, after: timesAfterMove });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const reopened = await waitForSaved(page, (project) => project.layers[0].animation.tracks.some((track) => track.property === "transform.x" && track.keyframes.length === 6), "animation reopen");
    const reopenedTrack = reopened.layers[0].animation.tracks.find((track) => track.property === "transform.x");
    check("55-09:reopenIdsAndTiming", new Set(reopenedTrack.keyframes.map((keyframe) => keyframe.id)).size === 6 && reopenedTrack.keyframes.every((keyframe) => Number.isFinite(keyframe.time)));
    check("55-10:easingSurvivesReopen", reopenedTrack.keyframes.filter((keyframe) => keyframe.easing === "cubic-bezier").length >= 3);
    await capture(page, "08-journey4-reopened.png");
}

async function journeyFive(page) {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    const start = page.getByLabel("Loop start seconds");
    const end = page.getByLabel("Loop end seconds");
    await start.fill("2");
    await start.press("Enter");
    await end.fill("5");
    await end.press("Enter");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.waitForTimeout(300);
    check("55-11:loopRegionEnabled", await page.getByRole("button", { name: /Loop On/ }).getAttribute("aria-pressed") === "true");
    check("55-11:loopMarkersVisible", await page.locator(".timeline-loop-region").isVisible());
    const endHandle = page.locator(".loop-handle-end");
    const handleBox = await endHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 60, handleBox.y + handleBox.height / 2, { steps: 6 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    const draggedEnd = Number(await page.getByLabel("Loop end seconds").inputValue());
    check("55-11:markersDraggable", draggedEnd > 5.01, draggedEnd);
    await page.getByLabel("Loop end seconds").fill("5");
    await page.getByLabel("Loop end seconds").press("Enter");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Play timeline" }).click();
    const samples = [];
    for (let index = 0; index < 9; index += 1) {
      samples.push(await page.locator(".timeline-timecode").textContent());
      await page.waitForTimeout(450);
    }
    await page.getByRole("button", { name: "Pause timeline" }).click();
    const seconds = samples.map((text) => {
      const [minutes, rest] = (text ?? "0:00.00").split(":");
      return Number(minutes) * 60 + Number(rest);
    });
    check("55-11:playbackLoopsInterval", seconds.every((value) => value >= 1.95 && value <= 5.05) && seconds.some((value, index) => index > 0 && value < seconds[index - 1] - 1.5), samples);
    record("journey5LoopSamples", samples);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const cancelDialog = page.getByRole("dialog", { name: "Export composition" });
    await cancelDialog.waitFor();
    await cancelDialog.getByRole("button", { name: /Loop \/ work range/ }).click();
    await cancelDialog.getByRole("button", { name: /Preview/ }).click();
    await cancelDialog.getByRole("button", { name: /Export range/ }).click();
    await cancelDialog.getByRole("button", { name: "Cancel export" }).waitFor({ timeout: 10_000 });
    await cancelDialog.getByRole("button", { name: "Cancel export" }).click();
    await cancelDialog.getByText("Export cancelled.", { exact: true }).waitFor({ timeout: 30_000 });
    check("55-12:rangeCancellation", true);
    await cancelDialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForTimeout(400);

    const range = path.join(mediaDirectory, "journey5-range.mp4");
    const rangeExport = await exportVideo(page, { rangeMode: "loop", quality: "preview", file: range });
    const rangeProbe = ffprobe(range);
    check("55-12:rangeDuration", Math.abs(Number(rangeProbe.format.duration) - 3) < 0.05, rangeProbe);
    check("55-12:rangeFrames", Number(rangeProbe.streams.find((stream) => stream.codec_type === "video")?.nb_frames) === 90, rangeProbe);
    check("55-12:rangeDimensions", rangeProbe.streams[0]?.width === 720 && rangeProbe.streams[0]?.height === 900, rangeProbe);
    record("journey5Range", { ...rangeExport, probe: rangeProbe });

    const full = path.join(mediaDirectory, "journey5-full.mp4");
    await exportVideo(page, { rangeMode: "full", quality: "preview", file: full });
    const fullFrame = extractFrame(full, 2, path.join(mediaDirectory, "journey5-full-at-2.png"));
    const rangeFrame = extractFrame(range, 0, path.join(mediaDirectory, "journey5-range-first.png"));
    const rangeMatch = ssim(fullFrame, rangeFrame);
    check("55-12:rangeContentMatchesComposition", rangeMatch >= 0.98, rangeMatch);
    record("journey5RangeMatch", rangeMatch);

    const seamless = path.join(mediaDirectory, "journey5-seamless.mp4");
    const seamlessExport = await exportVideo(page, { rangeMode: "loop", quality: "preview", seamless: true, file: seamless });
    const seamlessProbe = ffprobe(seamless);
    check("55-13:seamlessDuration", Math.abs(Number(seamlessProbe.format.duration) - 3) < 0.05, seamlessProbe);
    const first = extractFrame(seamless, 0, path.join(mediaDirectory, "journey5-seamless-first.png"));
    const second = extractFrame(seamless, 1 / 30, path.join(mediaDirectory, "journey5-seamless-second.png"));
    const boundary = extractFrame(seamless, 2.96, path.join(mediaDirectory, "journey5-seamless-last.png"));
    const boundarySsim = ssim(boundary, first);
    const adjacentSsim = ssim(first, second);
    check("55-13:seamlessBoundaryContinuous", boundarySsim > 0.7 && boundarySsim >= adjacentSsim * 0.9, { boundarySsim, adjacentSsim });
    record("journey5Seamless", { ...seamlessExport, probe: seamlessProbe, boundarySsim, adjacentSsim });
    await capture(page, "09-journey5-loop.png");

    await page.getByRole("button", { name: "Reset loop to full composition" }).click();
    await page.waitForTimeout(500);
    check("55-11:resetFullComposition", await page.getByLabel("Loop start seconds").inputValue() === "0" && await page.getByRole("button", { name: /Loop Off/ }).isVisible());

  const audioContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  try {
    await journey("journey5-audio", audioContext, async (audioPage) => {
      await openStudio(audioPage);
      await importVideo(audioPage, fixtures.audio);
      const start = audioPage.getByLabel("Loop start seconds");
      const end = audioPage.getByLabel("Loop end seconds");
      await start.fill("0.5");
      await start.press("Enter");
      await end.fill("1.5");
      await end.press("Enter");
      const file = path.join(mediaDirectory, "journey5-audio-range.mp4");
      const exported = await exportVideo(audioPage, { rangeMode: "loop", quality: "preview", file });
      const probe = ffprobe(file);
      const hasAudio = probe.streams.some((stream) => stream.codec_type === "audio");
      check("55-12:audioRangeDuration", Math.abs(Number(probe.format.duration) - 1) < 0.08, probe);
      check("55-12:audioRangeIncluded", hasAudio && /Source audio included/.test(exported.audioText), { probe, audioText: exported.audioText });
      record("journey5Audio", { ...exported, probe });
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

async function journeySix(page) {
  let packageFile = "";
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await page.waitForTimeout(700);
    const baselineHash = await canvasHash(page);
    const legacyRecord = await waitForSaved(page, (project) => project.layers.length === 1, "legacy base project");
    await writeLegacyProject(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const legacyHash = await canvasHash(page);
    check("55-15:legacyAppearanceUnchanged", baselineHash === legacyHash, { baselineHash, legacyHash });
    const normalized = await waitForSaved(page, (project) => project.loop?.enabled === false && project.layers[0].blendMode === "normal" && project.layers[0].mask.type === "none", "legacy defaults");
    check("55-15:legacyDefaultsSafe", normalized.loop.start === 0 && normalized.loop.end === normalized.canvas.duration);

    await openTab(page, "Edit");
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("screen");
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
    const loopStart = page.getByLabel("Loop start seconds");
    const loopEnd = page.getByLabel("Loop end seconds");
    await loopStart.fill("1");
    await loopStart.press("Enter");
    await loopEnd.fill("3");
    await loopEnd.press("Enter");
    await page.getByRole("button", { name: "Loop Off" }).click();
    await page.waitForTimeout(800);
    const featureProject = await waitForSaved(page, (project) => project.loop.enabled && project.layers[0].blendMode === "screen" && project.layers[0].mask.type === "ellipse", "new feature data");
    check("55-16:newFieldsSaved", featureProject.loop.start === 1 && featureProject.loop.end === 3);

    const downloadPromise = page.waitForEvent("download");
    await page.locator(".project-download-button").click();
    const download = await downloadPromise;
    packageFile = path.join(mediaDirectory, "journey6-editable.bendpkg");
    await download.saveAs(packageFile);
    check("55-17:packageCreated", true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(900);
    const reloaded = await waitForSaved(page, (project) => project.loop?.enabled && project.layers[0].mask.type === "ellipse", "feature reload");
    check("55-16:newFieldsReload", reloaded.layers[0].blendMode === "screen" && reloaded.loop.end === 3);
    await capture(page, "10-journey6-feature-project.png");

  const cleanContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  try {
    await journey("journey6-package", cleanContext, async (cleanPage) => {
      await openStudio(cleanPage);
      await cleanPage.getByRole("button", { name: "Open project library" }).click();
      const library = cleanPage.getByRole("dialog", { name: "Your projects" });
      await library.waitFor();
      await cleanPage.getByLabel("Open project package").setInputFiles(packageFile);
      const preview = cleanPage.getByRole("dialog", { name: /Open .*\?/ });
      await preview.waitFor({ timeout: 30_000 });
      check("55-17:packagePreviewed", await preview.getByText(/editable layers/).isVisible());
      await preview.getByRole("button", { name: "Open editable project" }).click();
      await cleanPage.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
      await cleanPage.waitForTimeout(900);
      const restored = await waitForSaved(cleanPage, (project) => project.layers.length === 1 && project.layers[0].mask.type === "ellipse" && project.loop.enabled, "package restore");
      check("55-17:packageRoundTripFeatures", restored.layers[0].blendMode === "screen" && restored.loop.start === 1 && restored.loop.end === 3);
      await capture(cleanPage, "11-journey6-package-restored.png");
    });
  } finally {
    await cleanContext.close().catch(() => undefined);
  }

  const integrationContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  try {
    await journey("journey6-integration", integrationContext, async (hostPage) => {
      await hostPage.goto(`${baseUrl}/integration`, { waitUntil: "domcontentloaded" });
      await hostPage.getByRole("heading", { name: /Place BEND/ }).waitFor({ timeout: 30_000 });
      await hostPage.getByRole("button", { name: "Add BEND layer" }).click();
      await hostPage.locator(".host-layer-row").waitFor({ timeout: 120_000 });
      const versionBefore = await hostPage.locator(".host-layer-row").first().getAttribute("data-source-version");
      await hostPage.getByRole("button", { name: "Edit in BEND" }).click();
      await hostPage.getByRole("heading", { name: /BEND editor:/ }).waitFor({ timeout: 30_000 });
      await hostPage.waitForTimeout(800);
      await openTab(hostPage, "Edit");
      await openDisclosure(hostPage, "Mask");
      await hostPage.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
      await hostPage.getByRole("button", { name: "Update Post" }).click();
      await hostPage.getByRole("heading", { name: /Place BEND/ }).waitFor({ timeout: 120_000 });
      const versionAfter = await hostPage.locator(".host-layer-row").first().getAttribute("data-source-version");
      check("55-18:hostUpdateCommitted", Boolean(versionAfter) && versionAfter !== versionBefore, { versionBefore, versionAfter });
      await capture(hostPage, "12-journey6-host-handoff.png");
    });
  } finally {
    await integrationContext.close().catch(() => undefined);
  }
}

async function blendModesJourney(page) {
  await openStudio(page);
  await addGenerator(page, "Signal Field");
  await addGenerator(page, "Refraction");
  await selectTimelineRow(page, 0);
  await openTab(page, "Edit");
  await openDisclosure(page, "Appearance");
  const previewHashes = {};
  const exportHashes = {};
  for (const mode of ["normal", "multiply", "screen", "add", "overlay"]) {
    await page.getByLabel("Blend mode").selectOption(mode);
    await page.waitForTimeout(700);
    previewHashes[mode] = await canvasHash(page);
    const file = path.join(mediaDirectory, `blend-mode-${mode}.png`);
    await exportStill(page, file);
    const bytes = await readFile(file);
    exportHashes[mode] = createHash("sha1").update(bytes).digest("hex");
    await capture(page, `14-blend-${mode}.png`, false);
  }
  check("55-06:previewModesDistinct", new Set(Object.values(previewHashes)).size === 5, previewHashes);
  check("55-06:exportModesDistinct", new Set(Object.values(exportHashes)).size === 5, exportHashes);
  record("blendModeHashes", { previewHashes, exportHashes });
}

async function accessibilityJourney(page) {
  await openStudio(page);
  await addGenerator(page, "Signal Field");
  await addGenerator(page, "Refraction");
  await selectTimelineRow(page, 0);
  await openTab(page, "Edit");
  await openDisclosure(page, "Appearance");
  await page.getByLabel("Blend mode").selectOption("screen");
  await openDisclosure(page, "Mask");
  await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
  const start = page.getByLabel("Loop start seconds");
  await start.fill("1");
  await start.press("Enter");
  await page.getByRole("button", { name: "Loop Off" }).click();
  await openTab(page, "Effects");
  await page.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
  await page.waitForTimeout(700);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export composition" });
  await exportDialog.waitFor();
  await exportDialog.getByRole("button", { name: /Loop \/ work range/ }).click();
  const exportResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const exportSerious = exportResults.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  await exportDialog.getByRole("button", { name: "Close export dialog" }).click();
  record("accessibility", {
    violations: results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
    seriousOrCritical: serious.length,
    exportViolations: exportResults.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
    exportSeriousOrCritical: exportSerious.length,
  });
  check("55-19:noSeriousAxeViolations", serious.length === 0, serious.map((violation) => violation.id));
  check("55-19:noSeriousExportDialogViolations", exportSerious.length === 0, exportSerious.map((violation) => violation.id));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  check("55-19:compactLayoutNoOverflow", dimensions.scrollWidth <= dimensions.width && dimensions.bodyScrollWidth <= dimensions.width, dimensions);
  await capture(page, "15-compact-editor.png");
}

async function statefulRangeJourney(page) {
  await openStudio(page);
  await addGenerator(page, "Liquid");
  await openTab(page, "Edit");
  await page.getByLabel("Duration value").fill("3");
  await page.getByLabel("Duration value").press("Enter");
  await openTab(page, "Effects");
  await page.locator(".effect-library-item").filter({ hasText: "Frame Feedback" }).click();
  await page.waitForTimeout(1000);
  const start = page.getByLabel("Loop start seconds");
  const end = page.getByLabel("Loop end seconds");
  await start.fill("1");
  await start.press("Enter");
  await end.fill("2.5");
  await end.press("Enter");
  await page.waitForTimeout(500);
  const full = path.join(mediaDirectory, "stateful-range-full.mp4");
  const range = path.join(mediaDirectory, "stateful-range-part.mp4");
  await exportVideo(page, { rangeMode: "full", quality: "preview", file: full });
  await exportVideo(page, { rangeMode: "loop", quality: "preview", file: range });
  const fullProbe = ffprobe(full);
  const rangeProbe = ffprobe(range);
  check("55-12:statefulRangeDuration", Math.abs(Number(rangeProbe.format.duration) - 1.5) < 0.06, rangeProbe);
  const fullFrame = extractFrame(full, 1, path.join(mediaDirectory, "stateful-full-at-1.png"));
  const rangeFrame = extractFrame(range, 0, path.join(mediaDirectory, "stateful-range-first.png"));
  const statefulMatch = ssim(fullFrame, rangeFrame);
  check("55-12:statefulRangeMatchesComposition", statefulMatch > 0.95, statefulMatch);
  record("statefulRange", { fullProbe, rangeProbe, statefulMatch });
}

async function performanceJourney(page) {
    await openStudio(page);
    await addGenerator(page, "Signal Field");
    await addGenerator(page, "Flow");
    await addGenerator(page, "Refraction");
    await selectTimelineRow(page, 0);
    await openTab(page, "Edit");
    await openDisclosure(page, "Appearance");
    await page.getByLabel("Blend mode").selectOption("screen");
    await openDisclosure(page, "Mask");
    await page.getByRole("group", { name: "Mask shape" }).getByRole("button", { name: "Ellipse" }).click();
    await openTab(page, "Effects");
    await page.locator(".effect-library-item").filter({ hasText: "Motion Echo" }).click();
    await page.waitForTimeout(1000);

    const samples = [];
    for (const time of [0.2, 0.9, 1.6, 2.3, 3.0, 3.7, 4.4, 5.1, 5.8]) {
      await scrubTo(page, time);
      await page.waitForTimeout(600);
      const value = await page.locator("canvas[data-testid=editor-canvas]").getAttribute("data-render-ms");
      if (value) samples.push(Number(value));
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    const memory = await page.evaluate(() => performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null);
    const layers = (await getLatestProject(page)).layers.length;
    check("55-14:representativeRenderMeasured", samples.length >= 7, samples);
    check("55-14:noRendererErrors", evidence.pageErrors.filter((entry) => entry.journey === "performance").length === 0);
    record("performance", {
      layers,
      samplesMs: samples,
      medianMs: median,
      p95Ms: p95,
      memory,
      note: "Measured in headless system Chrome with SwiftShader; includes temporal preparation, mask texture work, and custom blend pass.",
    });

    const rangeFile = path.join(mediaDirectory, "performance-export.mp4");
    const exported = await exportVideo(page, { rangeMode: "full", quality: "preview", file: rangeFile });
    evidence.performance.export = { ...exported, probe: ffprobe(rangeFile) };
    await capture(page, "13-performance-composite.png");
}

async function main() {
  await mkdir(evidenceDirectory, { recursive: true });
  await mkdir(mediaDirectory, { recursive: true });
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore", windowsHide: true });
  await waitForServer();
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--use-angle=swiftshader"] });
  evidence.browser = { name: "system Chrome", version: browser.version(), headless: true, swiftshader: true };

  const journeyContexts = [];
  const makeContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
    journeyContexts.push(context);
    return context;
  };

  try {
    if (wants("journey1")) await journey("journey1", await makeContext(), journeyOne);
    if (wants("journey2")) await journey("journey2", await makeContext(), journeyTwo);
    if (wants("journey3")) await journey("journey3", await makeContext(), journeyThree);
    if (wants("journey4")) await journey("journey4", await makeContext(), journeyFour);
    if (wants("journey5") || wants("journey5-audio")) await journey("journey5", await makeContext(), journeyFive);
    if (wants("journey6") || wants("journey6-package") || wants("journey6-integration")) await journey("journey6", await makeContext(), journeySix);
    if (wants("blend-modes")) await journey("blend-modes", await makeContext(), blendModesJourney);
    if (wants("accessibility")) await journey("accessibility", await makeContext(), accessibilityJourney);
    if (wants("stateful-range")) await journey("stateful-range", await makeContext(), statefulRangeJourney);
    if (wants("performance")) await journey("performance", await makeContext(), performanceJourney);
  } finally {
    await Promise.all(journeyContexts.map((context) => context.close().catch(() => undefined)));
  }
}

try {
  await main();
} catch (error) {
  evidence.fatal = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill();
  const statuses = Object.fromEntries(Object.entries(evidence.journeys).map(([name, journeyValue]) => [name, journeyValue.status]));
  evidence.summary = {
    journeys: statuses,
    passed: Object.values(statuses).filter((status) => status === "PASS").length,
    failed: Object.values(statuses).filter((status) => status === "FAIL").length,
    consoleErrors: evidence.consoleErrors.length,
    pageErrors: evidence.pageErrors.length,
  };
  await writeFile(path.join(evidenceDirectory, "phase5-5-acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence.summary, null, 2));
}
