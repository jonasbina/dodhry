// Jednoduchý filtr urážlivých a sprostých přezdívek. Neprůstřelný, ale zachytí běžné pokusy
// (diakritika, velká písmena, mezery mezi písmeny, 0→o, 1→i, opakovaná písmena).
// Slova se porovnávají až po sloučení opakovaných písmen, proto jsou v seznamu bez zdvojení.

// hledá se kdekoli ve jménu (slova, která v normálním jméně nebývají)
const ANYWHERE = [
  'negr', 'niger', 'nigr', 'niga', 'cigos', 'cikan', 'buzn', 'buzer', 'teplous', 'kurv', 'zmrd', 'kokot', 'curak',
  'mrdk', 'mrdat', 'jebat', 'jebn', 'sracka', 'hovno', 'prdel', 'hajzl', 'svine', 'devka', 'sukat', 'kunda',
  'picus', 'hitler', 'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'retard', 'fagot', 'porn', 'penis', 'vagin',
];
// jen jako samostatné slovo (jinak by blokovalo nevinná jména)
const WHOLE_WORD = ['pica', 'pico', 'pici', 'debil', 'kreten', 'nazi', 'fag', 'dick', 'sex', 'anal', 'coura', 'cum', 'jeb', 'mrd', 'nig'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/(.)\1+/g, '$1'); // „neeegr“ → „negr“

export function isBadName(name: string) {
  const n = normalize(name);
  const joined = n.replace(/[^a-z]/g, '');
  if (ANYWHERE.some((w) => joined.includes(w))) return true;
  const words = n.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WHOLE_WORD.includes(w))) return true;
  // „p i č a“ → slova po jednom písmenu spojená dohromady
  const spaced = words.every((w) => w.length === 1) ? [joined] : [];
  return spaced.some((w) => WHOLE_WORD.includes(w));
}
