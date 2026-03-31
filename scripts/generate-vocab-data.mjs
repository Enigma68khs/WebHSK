import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputFile = path.join(rootDir, "vocab-data.js");

const BASE_URL =
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old";
const LEVELS = [1, 2, 3, 4, 5, 6];
const SOURCE_LABEL = "drkameleon/complete-hsk-vocabulary";
const SOURCE_URL = "https://github.com/drkameleon/complete-hsk-vocabulary";

async function fetchLevel(level) {
  const response = await fetch(`${BASE_URL}/${level}.json`);
  if (!response.ok) {
    throw new Error(`Failed to download HSK ${level}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function pickPrimaryForm(entry) {
  return entry.forms.find((form) => form.transcriptions?.numeric) || entry.forms[0];
}

function sanitizeMeaning(text) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .trim();
}

function splitMeaningVariants(meanings) {
  const variants = new Set();

  meanings
    .map(sanitizeMeaning)
    .filter(Boolean)
    .forEach((meaning) => {
      variants.add(meaning);
      meaning
        .split(/[;/]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2)
        .forEach((part) => variants.add(part));
    });

  return [...variants];
}

function summarizeMeanings(meanings) {
  const fullMeanings = [];

  meanings
    .map(sanitizeMeaning)
    .filter(Boolean)
    .forEach((meaning) => {
      if (!fullMeanings.includes(meaning)) {
        fullMeanings.push(meaning);
      }
    });

  return fullMeanings.slice(0, 2).join(" / ");
}

function toAppWord(entry, level) {
  const form = pickPrimaryForm(entry);
  const meanings = splitMeaningVariants(form.meanings || []);
  const summary = summarizeMeanings(form.meanings || []);

  return {
    hanzi: entry.simplified,
    pinyin: form.transcriptions.numeric.toLowerCase(),
    meaning: summary,
    meanings,
    level
  };
}

function createOutput(levelMap) {
  const generatedAt = new Date().toISOString();
  return `window.HSK_VOCAB = ${JSON.stringify(levelMap, null, 2)};\n\nwindow.HSK_VOCAB_META = ${JSON.stringify(
    {
      generatedAt,
      source: SOURCE_LABEL,
      sourceUrl: SOURCE_URL,
      levels: LEVELS
    },
    null,
    2
  )};\n`;
}

async function main() {
  await mkdir(path.dirname(outputFile), { recursive: true });

  const vocab = {};
  for (const level of LEVELS) {
    const entries = await fetchLevel(level);
    vocab[level] = entries.map((entry) => toAppWord(entry, level));
  }

  await writeFile(outputFile, createOutput(vocab), "utf8");

  const total = Object.values(vocab).reduce((sum, words) => sum + words.length, 0);
  console.log(`Generated ${outputFile}`);
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Levels: ${LEVELS.join(", ")}`);
  console.log(`Words: ${total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
