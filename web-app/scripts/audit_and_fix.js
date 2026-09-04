// Audit and fix script for quiz_data.json and public/images
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const quizDataPath = path.resolve(__dirname, '../public/data/quiz_data.json');
const imagesDir = path.resolve(__dirname, '../public/images');

const quizData = JSON.parse(fs.readFileSync(quizDataPath, 'utf8'));
const existingImages = new Set(fs.readdirSync(imagesDir));

console.log(`Total topics: ${quizData.topicCount}`);
console.log(`Total questions: ${quizData.totalQuestions}`);
console.log(`Total images in public/images: ${existingImages.size}`);

let missingImageCount = 0;
let resolvedImageCount = 0;
let outOfBoundsCorrectIndex = 0;
let invalidOptionsCount = 0;
let textMentionsImageNull = 0;

const missingReports = [];

for (const topicKey of Object.keys(quizData.topics)) {
  const topic = quizData.topics[topicKey];
  for (const q of topic.questions) {
    // Check options & correct_index
    if (!q.options || q.options.length < 2) {
      console.warn(`[${q.id}] Less than 2 options:`, q);
      invalidOptionsCount++;
    }
    if (q.correct_index < 0 || q.correct_index >= q.options.length) {
      console.warn(`[${q.id}] Invalid correct_index: ${q.correct_index} for ${q.options.length} options`);
      outOfBoundsCorrectIndex++;
    }

    // Check images
    if (q.image) {
      if (!existingImages.has(q.image)) {
        missingImageCount++;
        // Try to resolve common naming mismatches:
        // 1. image_X.png -> image_X_1.png
        // 2. X.png -> X_1.png
        let candidate = null;
        const matchImage = q.image.match(/^image_(\d+)\.png$/);
        if (matchImage) {
          const num = matchImage[1];
          if (existingImages.has(`image_${num}_1.png`)) {
            candidate = `image_${num}_1.png`;
          } else if (existingImages.has(`${num}_1.png`)) {
            candidate = `${num}_1.png`;
          } else if (existingImages.has(`${num}.png`)) {
            candidate = `${num}.png`;
          }
        }

        const matchNum = q.image.match(/^(\d+)\.png$/);
        if (!candidate && matchNum) {
          const num = matchNum[1];
          if (existingImages.has(`${num}_1.png`)) {
            candidate = `${num}_1.png`;
          } else if (existingImages.has(`image_${num}_1.png`)) {
            candidate = `image_${num}_1.png`;
          } else if (existingImages.has(`image_${num}.png`)) {
            candidate = `image_${num}.png`;
          }
        }

        if (candidate) {
          resolvedImageCount++;
          missingReports.push({
            id: q.id,
            oldImage: q.image,
            resolvedTo: candidate
          });
          // Auto-fix
          q.image = candidate;
        } else {
          missingReports.push({
            id: q.id,
            oldImage: q.image,
            resolvedTo: null
          });
        }
      }
    } else {
      // Check if text says "на рисунке"
      if (q.question.includes('на рисунке') || q.question.includes('на рисунка') || q.question.includes('эти дорожные знаки')) {
        textMentionsImageNull++;
      }
    }
  }
}

console.log(`\n=== AUDIT REPORT ===`);
console.log(`Missing image references: ${missingImageCount}`);
console.log(`Auto-resolved filename mismatches (e.g. image_X.png -> image_X_1.png): ${resolvedImageCount}`);
console.log(`Still unresolved missing images: ${missingImageCount - resolvedImageCount}`);
console.log(`Out of bounds correct_index: ${outOfBoundsCorrectIndex}`);
console.log(`Invalid options: ${invalidOptionsCount}`);
console.log(`Questions mentioning drawing with null image: ${textMentionsImageNull}`);

// Save updated quiz_data.json with resolved images
if (resolvedImageCount > 0) {
  fs.writeFileSync(quizDataPath, JSON.stringify(quizData, null, 2), 'utf8');
  console.log(`Updated ${quizDataPath} with ${resolvedImageCount} resolved image paths!`);
}

fs.writeFileSync(
  path.resolve(__dirname, 'missing_images_report.json'),
  JSON.stringify(missingReports, null, 2),
  'utf8'
);
