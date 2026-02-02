export const USE_MOCK_DATA = true;

export interface Trade {
  timestamp: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  priceAtTrade: number;
  outcome: "win" | "loss";
  pnl: number;
}

export interface Pattern {
  type:
    | "revenge_trading"
    | "overtrading"
    | "losing_streak"
    | "bad_hours"
    | "tilt_sizing";
  severity: "low" | "medium" | "high";
  description: string;
  occurrences: number;
  estimatedLoss: number;
}

export interface TraderStats {
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  riskControl: number;
  endurance: number;
}

export type Tier = "Bronze" | "Silver" | "Gold" | "Diamond" | "Legendary";

export interface AnalysisResult {
  trades: Trade[];
  patterns: Pattern[];
  stats: TraderStats;
  overallRating: number;
  tier: Tier;
  estimatedPreventableLoss: number;
  recommendedRules: {
    dailyLossLimit: number;
    maxTradesPerDay: number;
    lockoutDuration: number;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const TOKENS = ["SOL", "USDC", "BONK", "JUP", "RAY", "ORCA", "MNGO", "SRM"];

function generateTrades(random: () => number, count: number): Trade[] {
  const trades: Trade[] = [];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const timestamp = now - Math.floor(random() * thirtyDaysMs);
    const tokenInIdx = Math.floor(random() * TOKENS.length);
    let tokenOutIdx = Math.floor(random() * TOKENS.length);
    while (tokenOutIdx === tokenInIdx) {
      tokenOutIdx = (tokenOutIdx + 1) % TOKENS.length;
    }

    const tokenIn = TOKENS[tokenInIdx];
    const tokenOut = TOKENS[tokenOutIdx];
    const amountIn = Math.floor(random() * 1000 * 100) / 100 + 10;
    const priceAtTrade = random() * 100 + 0.5;
    const outcome: "win" | "loss" = random() > 0.45 ? "win" : "loss";
    const pnlPercent =
      outcome === "win" ? random() * 0.15 + 0.01 : -(random() * 0.25 + 0.02);
    const pnl = Math.floor(amountIn * pnlPercent * 100) / 100;
    const amountOut = amountIn + pnl;

    trades.push({
      timestamp,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      priceAtTrade,
      outcome,
      pnl,
    });
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

function detectPatterns(trades: Trade[], random: () => number): Pattern[] {
  const patterns: Pattern[] = [];
  const losses = trades.filter((t) => t.outcome === "loss");
  const totalLoss = losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0);

  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;
  for (const trade of trades) {
    if (trade.outcome === "loss") {
      consecutiveLosses++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
    } else {
      consecutiveLosses = 0;
    }
  }

  if (maxConsecutiveLosses >= 3) {
    const severity =
      maxConsecutiveLosses >= 6
        ? "high"
        : maxConsecutiveLosses >= 4
          ? "medium"
          : "low";
    patterns.push({
      type: "losing_streak",
      severity,
      description: `Detected ${maxConsecutiveLosses} consecutive losses. Consider taking breaks after 2-3 losses.`,
      occurrences: Math.floor(losses.length / maxConsecutiveLosses),
      estimatedLoss: Math.floor(totalLoss * 0.3),
    });
  }

  const revengeTradeCount = Math.floor(random() * 8) + 2;
  if (revengeTradeCount > 3) {
    const severity =
      revengeTradeCount >= 8
        ? "high"
        : revengeTradeCount >= 5
          ? "medium"
          : "low";
    patterns.push({
      type: "revenge_trading",
      severity,
      description: `Found ${revengeTradeCount} instances of trades within 5 minutes of a loss with increased size.`,
      occurrences: revengeTradeCount,
      estimatedLoss: Math.floor(totalLoss * 0.25),
    });
  }

  const tradesPerDay: Record<string, number> = {};
  for (const trade of trades) {
    const day = new Date(trade.timestamp).toDateString();
    tradesPerDay[day] = (tradesPerDay[day] || 0) + 1;
  }
  const overTradingDays = Object.values(tradesPerDay).filter(
    (count) => count > 10
  ).length;
  if (overTradingDays > 0) {
    const severity =
      overTradingDays >= 5 ? "high" : overTradingDays >= 3 ? "medium" : "low";
    patterns.push({
      type: "overtrading",
      severity,
      description: `${overTradingDays} days with more than 10 trades. High frequency trading often leads to poor decisions.`,
      occurrences: overTradingDays,
      estimatedLoss: Math.floor(totalLoss * 0.2),
    });
  }

  const hourCounts: Record<number, { wins: number; losses: number }> = {};
  for (const trade of trades) {
    const hour = new Date(trade.timestamp).getHours();
    if (!hourCounts[hour]) {
      hourCounts[hour] = { wins: 0, losses: 0 };
    }
    if (trade.outcome === "win") {
      hourCounts[hour].wins++;
    } else {
      hourCounts[hour].losses++;
    }
  }
  const badHours = Object.entries(hourCounts)
    .filter(([_, stats]) => stats.losses > stats.wins * 2 && stats.losses >= 3)
    .map(([hour]) => parseInt(hour));
  if (badHours.length > 0) {
    const severity =
      badHours.length >= 4 ? "high" : badHours.length >= 2 ? "medium" : "low";
    patterns.push({
      type: "bad_hours",
      severity,
      description: `Poor performance during hours: ${badHours.map((h) => `${h}:00`).join(", ")}. Consider avoiding trading during these times.`,
      occurrences: badHours.length,
      estimatedLoss: Math.floor(totalLoss * 0.15),
    });
  }

  const avgSize =
    trades.reduce((sum, t) => sum + t.amountIn, 0) / trades.length;
  const tiltTrades = trades.filter(
    (t) => t.amountIn > avgSize * 2 && t.outcome === "loss"
  );
  if (tiltTrades.length > 0) {
    const severity =
      tiltTrades.length >= 5
        ? "high"
        : tiltTrades.length >= 3
          ? "medium"
          : "low";
    patterns.push({
      type: "tilt_sizing",
      severity,
      description: `${tiltTrades.length} trades with position sizes 2x+ average resulted in losses. Emotional sizing detected.`,
      occurrences: tiltTrades.length,
      estimatedLoss: tiltTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0),
    });
  }

  return patterns;
}

function calculateStats(
  trades: Trade[],
  patterns: Pattern[],
  random: () => number
): TraderStats {
  const winRate =
    trades.filter((t) => t.outcome === "win").length / trades.length;
  const highSeverityCount = patterns.filter(
    (p) => p.severity === "high"
  ).length;
  const mediumSeverityCount = patterns.filter(
    (p) => p.severity === "medium"
  ).length;

  const patternPenalty = highSeverityCount * 15 + mediumSeverityCount * 8;
  const baseScore = Math.floor(winRate * 60 + 20);

  const discipline = Math.max(
    10,
    Math.min(99, baseScore - patternPenalty + Math.floor(random() * 20))
  );
  const patience = Math.max(
    10,
    Math.min(
      99,
      baseScore -
        (patterns.some((p) => p.type === "revenge_trading") ? 20 : 0) +
        Math.floor(random() * 25)
    )
  );
  const consistency = Math.max(
    10,
    Math.min(99, baseScore + Math.floor(random() * 15) - 5)
  );
  const timing = Math.max(
    10,
    Math.min(
      99,
      baseScore -
        (patterns.some((p) => p.type === "bad_hours") ? 15 : 0) +
        Math.floor(random() * 20)
    )
  );
  const riskControl = Math.max(
    10,
    Math.min(
      99,
      baseScore -
        (patterns.some((p) => p.type === "tilt_sizing") ? 25 : 0) +
        Math.floor(random() * 15)
    )
  );
  const endurance = Math.max(
    10,
    Math.min(
      99,
      baseScore -
        (patterns.some((p) => p.type === "losing_streak") ? 20 : 0) +
        Math.floor(random() * 20)
    )
  );

  return {
    discipline,
    patience,
    consistency,
    timing,
    riskControl,
    endurance,
  };
}

function calculateOverallRating(stats: TraderStats): number {
  const weights = {
    discipline: 0.2,
    patience: 0.15,
    consistency: 0.2,
    timing: 0.15,
    riskControl: 0.2,
    endurance: 0.1,
  };

  const weighted =
    stats.discipline * weights.discipline +
    stats.patience * weights.patience +
    stats.consistency * weights.consistency +
    stats.timing * weights.timing +
    stats.riskControl * weights.riskControl +
    stats.endurance * weights.endurance;

  return Math.floor(weighted);
}

function determineTier(rating: number): Tier {
  if (rating >= 85) return "Legendary";
  if (rating >= 70) return "Diamond";
  if (rating >= 55) return "Gold";
  if (rating >= 40) return "Silver";
  return "Bronze";
}

function calculateRecommendedRules(
  patterns: Pattern[],
  trades: Trade[]
): {
  dailyLossLimit: number;
  maxTradesPerDay: number;
  lockoutDuration: number;
} {
  const avgDailyLoss =
    trades
      .filter((t) => t.outcome === "loss")
      .reduce((sum, t) => sum + Math.abs(t.pnl), 0) / 30;

  const hasRevenge = patterns.some((p) => p.type === "revenge_trading");
  const hasOvertrading = patterns.some((p) => p.type === "overtrading");
  const hasLosingStreak = patterns.some((p) => p.type === "losing_streak");

  const dailyLossLimit = Math.max(50, Math.floor(avgDailyLoss * 0.7));
  const maxTradesPerDay = hasOvertrading ? 5 : 10;
  const lockoutDuration = hasRevenge || hasLosingStreak ? 24 : 12;

  return {
    dailyLossLimit,
    maxTradesPerDay,
    lockoutDuration,
  };
}

export function getMockAnalysis(walletAddress: string): AnalysisResult {
  const seed = hashString(walletAddress);
  const random = seededRandom(seed);

  const tradeCount = Math.floor(random() * 80) + 40;
  const trades = generateTrades(random, tradeCount);
  const patterns = detectPatterns(trades, random);
  const stats = calculateStats(trades, patterns, random);
  const overallRating = calculateOverallRating(stats);
  const tier = determineTier(overallRating);
  const estimatedPreventableLoss = patterns.reduce(
    (sum, p) => sum + p.estimatedLoss,
    0
  );
  const recommendedRules = calculateRecommendedRules(patterns, trades);

  return {
    trades,
    patterns,
    stats,
    overallRating,
    tier,
    estimatedPreventableLoss,
    recommendedRules,
  };
}
