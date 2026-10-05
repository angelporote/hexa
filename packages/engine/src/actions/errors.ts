/** Códigos de error de dominio; la web los traduce vía i18n. */
export type RuleError =
  | 'GAME_OVER'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'INVALID_VERTEX'
  | 'INVALID_EDGE'
  | 'INVALID_HEX'
  | 'VERTEX_OCCUPIED'
  | 'EDGE_OCCUPIED'
  | 'TOO_CLOSE_TO_BUILDING'
  | 'NOT_CONNECTED'
  | 'NOT_ENOUGH_RESOURCES'
  | 'NO_SETTLEMENT_TO_UPGRADE'
  | 'NO_PIECES_LEFT'
  | 'NOT_IMPLEMENTED';
