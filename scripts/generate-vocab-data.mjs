import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputFile = path.join(rootDir, "vocab-data.js");
const overridesFile = path.join(rootDir, "data", "meaning-overrides.json");

const BASE_URL =
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old";
const LEVELS = [1, 2, 3, 4, 5, 6];
const SOURCE_LABEL = "drkameleon/complete-hsk-vocabulary";
const SOURCE_URL = "https://github.com/drkameleon/complete-hsk-vocabulary";
const NOISE_PATTERNS = [
  /^see\s+/i,
  /^variant of\s+/i,
  /^old variant of\s+/i,
  /^also written\s+/i,
  /^also pr\.\s+/i,
  /^surname\s+/i,
  /^place name$/i
];

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

function normalizeMeaning(text) {
  return text
    .replace(/\blit\.\s*/gi, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\betc\.\b/gi, " ")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+,/g, ",")
    .trim();
}

function isUsefulMeaning(text) {
  if (!text || text.length < 2) return false;
  return !NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function toMeaningParts(text) {
  return normalizeMeaning(text)
    .split(/[;/]/)
    .map((part) => part.trim())
    .filter(isUsefulMeaning);
}

function dedupeMeanings(meanings) {
  const deduped = [];

  meanings.forEach((meaning) => {
    const normalized = meaning.toLowerCase();
    const hasBroaderExisting = deduped.some((existing) => {
      const current = existing.toLowerCase();
      return current === normalized || current.includes(normalized);
    });
    if (hasBroaderExisting) {
      return;
    }

    for (let index = deduped.length - 1; index >= 0; index -= 1) {
      if (normalized.includes(deduped[index].toLowerCase())) {
        deduped.splice(index, 1);
      }
    }

    deduped.push(meaning);
  });

  return deduped;
}

function splitMeaningVariants(meanings) {
  const variants = new Set();

  meanings
    .flatMap((meaning) => toMeaningParts(meaning))
    .forEach((meaning) => variants.add(meaning));

  return dedupeMeanings([...variants]);
}

function summarizeMeanings(meanings) {
  return splitMeaningVariants(meanings).slice(0, 2).join(" / ");
}

async function loadMeaningOverrides() {
  try {
    const raw = await readFile(overridesFile, "utf8");
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([hanzi, value]) => {
        const meanings = Array.isArray(value?.meanings)
          ? dedupeMeanings(value.meanings.map(normalizeMeaning).filter(isUsefulMeaning))
          : [];
        const meaning = normalizeMeaning(value?.meaning || meanings[0] || "");

        return [
          hanzi,
          {
            meaning: isUsefulMeaning(meaning) ? meaning : summarizeMeanings(meanings),
            meanings
          }
        ];
      })
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function toAppWord(entry, level, meaningOverrides) {
  const form = pickPrimaryForm(entry);
  const override = meaningOverrides[entry.simplified];
  const meanings = override?.meanings?.length ? override.meanings : splitMeaningVariants(form.meanings || []);
  const summary = override?.meaning || summarizeMeanings(form.meanings || []) || meanings[0] || "";

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
  await mkdir(path.dirname(overridesFile), { recursive: true });

  const meaningOverrides = await loadMeaningOverrides();

  const vocab = {};
  for (const level of LEVELS) {
    const entries = await fetchLevel(level);
    vocab[level] = entries.map((entry) => toAppWord(entry, level, meaningOverrides));
  }

  await writeFile(outputFile, createOutput(vocab), "utf8");

  const total = Object.values(vocab).reduce((sum, words) => sum + words.length, 0);
  console.log(`Generated ${outputFile}`);
  console.log(`Overrides: ${overridesFile}`);
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Levels: ${LEVELS.join(", ")}`);
  console.log(`Words: ${total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
