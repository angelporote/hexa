/** Campos de log para cualquier cosa que se haya lanzado: el mensaje y, si lo hay, la pila. */
export function errorFields(error: unknown): { error: string; stack?: string } {
  if (error instanceof Error) {
    return { error: error.message || error.name, ...(error.stack ? { stack: error.stack } : {}) };
  }
  return { error: String(error) };
}
