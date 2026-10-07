const NAME_KEY = 'hexa.playerName';

/** Último nombre usado en este dispositivo, para no escribirlo cada vez. */
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Sin almacenamiento: simplemente no se recuerda el nombre.
  }
}
