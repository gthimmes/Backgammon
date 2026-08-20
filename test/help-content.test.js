// Integrity checks for the in-app help center (public/help/ + the widget
// wiring in index.html). Run with `npm test` — Node's built-in runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// content.js is a plain browser script that assigns a global; importing it as
// a module executes it and leaves the corpus on globalThis.
await import('../public/help/content.js');
const content = globalThis.BG_HELP_CONTENT;

test('help corpus exists and has the expected shape', () => {
  assert.ok(content, 'BG_HELP_CONTENT global is set');
  assert.ok(Array.isArray(content.categories) && content.categories.length >= 4,
    'has at least 4 categories');
  assert.ok(content.articles.length >= 10 && content.articles.length <= 15,
    `has 10–15 articles (got ${content.articles.length})`);
});

test('categories are unique and fully described', () => {
  const ids = content.categories.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'category ids are unique');
  for (const c of content.categories) {
    assert.ok(c.title && c.icon && c.description, `category ${c.id} has title/icon/description`);
  }
});

test('every article is complete and points at real categories', () => {
  const catIds = new Set(content.categories.map((c) => c.id));
  const ids = content.articles.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'article ids are unique');
  for (const a of content.articles) {
    assert.ok(a.title, `article ${a.id} has a title`);
    assert.ok(a.body && a.body.trim().length > 100, `article ${a.id} has a substantial body`);
    assert.ok(catIds.has(a.category), `article ${a.id} references a declared category (${a.category})`);
    assert.ok(Array.isArray(a.tags) && a.tags.length > 0, `article ${a.id} has tags`);
  }
});

test('every category has articles, and some articles are featured', () => {
  for (const c of content.categories) {
    assert.ok(content.articles.some((a) => a.category === c.id),
      `category ${c.id} has at least one article`);
  }
  assert.ok(content.articles.filter((a) => a.featured).length >= 2,
    'at least two featured articles for the home view');
});

test('related links all resolve to existing articles (no dangling ids)', () => {
  const ids = new Set(content.articles.map((a) => a.id));
  for (const a of content.articles) {
    for (const r of a.related ?? []) {
      assert.ok(ids.has(r), `article ${a.id} relates to existing article ${r}`);
      assert.notEqual(r, a.id, `article ${a.id} does not relate to itself`);
    }
  }
});

test('the widget is wired up: index.html scripts and the served IIFE build', () => {
  const html = readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(html, /vendor\/help-navigator\/index\.global\.js/, 'index.html loads the widget build');
  assert.match(html, /help\/content\.js/, 'index.html loads the help corpus');
  assert.match(html, /help\/help\.js/, 'index.html loads the widget init script');
  assert.ok(existsSync(path.join(root, 'node_modules', 'help-navigator', 'dist', 'index.global.js')),
    'the installed package provides dist/index.global.js for the /vendor route');
});
