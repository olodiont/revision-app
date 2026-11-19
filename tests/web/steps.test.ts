import { splitCorrectionSections, splitIntoSteps } from '../../web/lib/steps';

test('splitCorrectionSections hides only the "### Correction" parts, statements and tools stay visible', () => {
  const md = '## Outils utiles\nIPP.\n\n## Exercice 1\n> Calculer A.\n\n### Correction\nA = 1.\n\n## Exercice 2\n> Calculer B.\n\n### Correction\nB = 2.\n\n```py\n### Correction pas un titre\n```';
  expect(splitCorrectionSections(md)).toEqual([
    { text: '## Outils utiles\nIPP.\n\n## Exercice 1\n> Calculer A.', hidden: false },
    { text: '### Correction\nA = 1.', hidden: true },
    { text: '## Exercice 2\n> Calculer B.', hidden: false },
    { text: '### Correction\nB = 2.\n\n```py\n### Correction pas un titre\n```', hidden: true },
  ]);
});

test('splitCorrectionSections returns null when the correction has no "Correction" headings (older layout)', () => {
  expect(splitCorrectionSections('## Étape 1\nx\n\n## Étape 2\ny')).toBeNull();
});

test('splitIntoSteps splits on headings', () => {
  const md = 'Intro.\n\n## Étape 1\nOn pose u.\n\n## Étape 2\nOn dérive.\n\n### Détail\nx';
  expect(splitIntoSteps(md)).toEqual(['Intro.', '## Étape 1\nOn pose u.', '## Étape 2\nOn dérive.', '### Détail\nx']);
});

test('splitIntoSteps falls back to paragraphs', () => {
  expect(splitIntoSteps('Un.\n\nDeux.\n\n\nTrois.')).toEqual(['Un.', 'Deux.', 'Trois.']);
});

test('splitIntoSteps never splits inside ``` or $$ blocks', () => {
  const md = 'Avant.\n\n```python\n# pas un titre\n\nx = 1\n```\n\n$$\na\n\nb\n$$\n\nAprès.';
  expect(splitIntoSteps(md)).toEqual(['Avant.', '```python\n# pas un titre\n\nx = 1\n```', '$$\na\n\nb\n$$', 'Après.']);
});

test('splitIntoSteps returns [] for empty text', () => {
  expect(splitIntoSteps('  \n')).toEqual([]);
});
