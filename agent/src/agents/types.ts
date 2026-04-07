export interface AgentProfile {
  name: string;
  emoji: string;
  fixedPremiumBps: number;
  spreadBps: number;
  maxExposurePct: number;
  capitalUsdc: number;
  keypairPath: string;
}

export interface AgentState {
  name: string;
  emoji: string;
  lendRateBps: number;
  borrowRateBps: number;
  orderAmount: number;
  ordersPlaced: number;
  dryRun: boolean;
  error?: string;
}
