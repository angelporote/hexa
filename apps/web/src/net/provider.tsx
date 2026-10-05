import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { GameConnection } from './connection.js';
import type { ConnectionSnapshot } from './connection.js';
import { browserSessionStore } from './session-store.js';
import { socketTransport } from './transport.js';

const Context = createContext<GameConnection | null>(null);

/** Crea una sola conexión por aplicación (o usa la que se le pase, en tests). */
export function ConnectionProvider({
  children,
  connection,
}: {
  children: ReactNode;
  connection?: GameConnection;
}) {
  const [created] = useState(
    () => connection ?? new GameConnection(socketTransport(), browserSessionStore()),
  );
  return <Context.Provider value={created}>{children}</Context.Provider>;
}

export function useConnection(): GameConnection {
  const value = useContext(Context);
  if (!value) throw new Error('useConnection debe usarse dentro de <ConnectionProvider>');
  return value;
}

export function useSnapshot(): ConnectionSnapshot {
  const connection = useConnection();
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot);
}
