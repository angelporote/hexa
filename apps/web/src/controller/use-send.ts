import { useCallback, useState } from 'react';
import type { Action } from '@hexa/engine';
import type { PreviewTarget } from '@hexa/protocol';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';

/** Envío de acciones del jugador con estado de «ocupado» y mensaje de error traducido. */
export function useSender() {
  const connection = useConnection();
  const { error } = useI18n();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = useCallback(
    async (action: Action): Promise<boolean> => {
      setBusy(true);
      const ack = await connection.request('game:action', { action });
      setBusy(false);
      setProblem(ack.ok ? null : error(ack.error));
      return ack.ok;
    },
    [connection, error],
  );

  /** Enseña a los demás (host incluido) lo que se está a punto de elegir; no es crítico si falla. */
  const preview = useCallback(
    (target: PreviewTarget | null) => {
      void connection.request('game:preview', { target });
    },
    [connection],
  );

  const clearProblem = useCallback(() => setProblem(null), []);
  return { send, preview, busy, problem, clearProblem };
}
