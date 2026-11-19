import { parseSections } from '../../server/claude/sections';

test('parseSections splits on ===NAME=== lines and trims', () => {
  const text = 'préambule ignoré\n===ENONCE===\n  Soit f.  \n===CORRECTION===\nOn pose u.\n\nFin.\n';
  expect(parseSections(text)).toEqual({ ENONCE: 'Soit f.', CORRECTION: 'On pose u.\n\nFin.' });
});

test('parseSections returns {} when no marker present', () => {
  expect(parseSections('Juste une réponse.')).toEqual({});
});

test('parseSections ignores a marker that is not alone on its line', () => {
  expect(parseSections('texte ===CORRECTION=== suite')).toEqual({});
});
