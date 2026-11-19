import { splitIntoSteps } from '../../web/lib/steps';

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
