#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";

import {build} from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(root, "backend/lib/matter/MatterRuntime.source.mjs");
const outfile = path.join(root, "backend/lib/matter/MatterRuntime.generated.js");

const disableUnusedPlatforms = {
    name: "disable-unused-matter-platforms",
    setup(buildContext) {
        buildContext.onLoad({filter: /storage\/sqlite\/platform\/(?:BunSqlite|NodeJsSqlite)\.js$/}, () => ({
            contents: [
                "export function createBunDatabase() { throw new Error('SQLite storage is not bundled'); }",
                "export function createNodeJsDatabase() { throw new Error('SQLite storage is not bundled'); }"
            ].join("\n"),
            loader: "js"
        }));
        buildContext.onLoad({filter: /net\/NodeJsHttpEndpoint\.js$/}, () => ({
            contents: [
                "class UnsupportedHttpEndpointFactory {",
                "    async create() { throw new Error('Matter HTTP transport is not bundled'); }",
                "}",
                "export const NodeJsHttpEndpoint = {Factory: UnsupportedHttpEndpointFactory};"
            ].join("\n"),
            loader: "js"
        }));
    }
};

const result = await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    // The bundle is third-party @matter runtime code; exclude it from our type-checking.
    banner: {js: "// @ts-nocheck"},
    plugins: [disableUnusedPlatforms],
    treeShaking: true,
    minifySyntax: false,
    minifyWhitespace: false,
    legalComments: "none",
    metafile: true,
    logLevel: "warning"
});

const output = Object.values(result.metafile.outputs)[0];
console.log(`Matter runtime bundle: ${(output.bytes / 1024 / 1024).toFixed(2)} MiB`);
