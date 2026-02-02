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

export type PatternType =
  | "revenge_trading"
  | "overtrading"
  | "losing_streak"
  | "bad_hours"
  | "tilt_sizing";

export interface Pattern {
  type: PatternType;
  detected: boolean;
  occurrences: number;
  estimatedLoss: number;
  details: PatternDetails;
}

export interface RevengeDetails {
  percentageAfterLoss: number;
  followUpLossRate: number;
  avgTimeAfterLoss: number;
  tradingTradesIndices: number[];
}

export interface OvertradingDetails {
  daysOver10Trades: number;
  lossRateOnHighDays: number;
  optimalTradeCount: { min: number; max: number };
}

export interface LosingStreakDetails {
  longestStreak: number;
  avgTradesAfterStreak: number;
  totalStreaks: number;
}

export interface BadHoursDetails {
  offHoursTrades: number;
  offHoursLossRate: number;
  lossMultiplier: number;
  badHoursRange: { start: number; end: number };
}

export interface TiltSizingDetails {
  avgSizeIncrease: number;
  winRateAtTiltSize: number;
  normalWinRate: number;
  tiltTradesCount: number;
}

export type PatternDetails =
  | RevengeDetails
  | OvertradingDetails
  | LosingStreakDetails
  | BadHoursDetails
  | TiltSizingDetails;

export interface TraderStats {
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  riskControl: number;
  endurance: number;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  avgTradeSize: number;
  tradingDays: number;
}

export type Tier =
  | "legendary"
  | "epic"
  | "rare"
  | "uncommon"
  | "common"
  | "bronze";

export interface TierInfo {
  tier: Tier;
  color: string;
  label: string;
  description: string;
}

export interface RecommendedRule {
  type:
    | "daily_loss_limit"
    | "cooldown"
    | "max_position"
    | "trade_limit"
    | "time_restriction";
  label: string;
  value: number | string;
  unit: string;
  estimatedSavings: number;
  priority: "required" | "recommended" | "optional";
  rationale: string;
}

export interface RecommendedRules {
  rules: RecommendedRule[];
  totalEstimatedSavings: number;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_DAILY_TRADES = 10;
const LOSING_STREAK_THRESHOLD = 3;
const BAD_HOURS_START = 23;
const BAD_HOURS_END = 5;
const TILT_SIZE_INCREASE_THRESHOLD = 1.5;

function getHourFromTimestamp(timestamp: number): number {
  return new Date(timestamp).getHours();
}

function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isBadHour(hour: number): boolean {
  return hour >= BAD_HOURS_START || hour < BAD_HOURS_END;
}

function detectRevengeTrading(trades: Trade[]): Pattern {
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let revengeCount = 0;
  let revengeLosses = 0;
  let revengeLossCount = 0;
  const revengeIndices: number[] = [];
  let totalTimeAfterLoss = 0;
  let timeAfterLossCount = 0;

  for (let i = 1; i < sortedTrades.length; i++) {
    const prevTrade = sortedTrades[i - 1];
    const currTrade = sortedTrades[i];

    if (prevTrade.outcome === "loss") {
      const timeDiff = currTrade.timestamp - prevTrade.timestamp;
      totalTimeAfterLoss += timeDiff;
      timeAfterLossCount++;

      if (timeDiff <= FIVE_MINUTES_MS) {
        revengeCount++;
        revengeIndices.push(i);
        if (currTrade.outcome === "loss") {
          revengeLossCount++;
          revengeLosses += Math.abs(currTrade.pnl);
        }
      }
    }
  }

  const lossTrades = sortedTrades.filter((t) => t.outcome === "loss");
  const percentageAfterLoss =
    lossTrades.length > 0 ? (revengeCount / lossTrades.length) * 100 : 0;
  const followUpLossRate =
    revengeCount > 0 ? (revengeLossCount / revengeCount) * 100 : 0;
  const avgTimeAfterLoss =
    timeAfterLossCount > 0
      ? totalTimeAfterLoss / timeAfterLossCount / 1000 / 60
      : 0;

  return {
    type: "revenge_trading",
    detected: revengeCount > 0,
    occurrences: revengeCount,
    estimatedLoss: revengeLosses,
    details: {
      percentageAfterLoss,
      followUpLossRate,
      avgTimeAfterLoss,
      tradingTradesIndices: revengeIndices,
    } as RevengeDetails,
  };
}

function detectOvertrading(trades: Trade[]): Pattern {
  const tradesByDay = new Map<string, Trade[]>();

  for (const trade of trades) {
    const dayKey = getDayKey(trade.timestamp);
    const dayTrades = tradesByDay.get(dayKey) || [];
    dayTrades.push(trade);
    tradesByDay.set(dayKey, dayTrades);
  }

  let daysOver10 = 0;
  let lossesOnHighDays = 0;
  let totalHighDayPnl = 0;
  let totalLowDayPnl = 0;
  let lowDayCount = 0;

  for (const [, dayTrades] of Array.from(tradesByDay)) {
    const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);

    if (dayTrades.length > MAX_DAILY_TRADES) {
      daysOver10++;
      if (dayPnl < 0) {
        lossesOnHighDays++;
        totalHighDayPnl += Math.abs(dayPnl);
      }
    } else {
      lowDayCount++;
      totalLowDayPnl += dayPnl;
    }
  }

  const lossRateOnHighDays =
    daysOver10 > 0 ? (lossesOnHighDays / daysOver10) * 100 : 0;

  const optimalTradeCount = { min: 5, max: 8 };

  return {
    type: "overtrading",
    detected: daysOver10 > 0,
    occurrences: daysOver10,
    estimatedLoss: totalHighDayPnl,
    details: {
      daysOver10Trades: daysOver10,
      lossRateOnHighDays,
      optimalTradeCount,
    } as OvertradingDetails,
  };
}

function detectLosingStreaks(trades: Trade[]): Pattern {
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  let currentStreak = 0;
  let longestStreak = 0;
  let totalStreaks = 0;
  let streakLosses = 0;
  let tradesAfterStreaks = 0;
  let streaksEnded = 0;
  let inStreak = false;
  let streakStartIdx = 0;

  for (let i = 0; i < sortedTrades.length; i++) {
    const trade = sortedTrades[i];

    if (trade.outcome === "loss") {
      if (!inStreak) {
        streakStartIdx = i;
      }
      currentStreak++;

      if (currentStreak >= LOSING_STREAK_THRESHOLD) {
        inStreak = true;
        if (currentStreak === LOSING_STREAK_THRESHOLD) {
          totalStreaks++;
        }
        streakLosses += Math.abs(trade.pnl);
      }
    } else {
      if (inStreak) {
        streaksEnded++;
        let tradesUntilStop = 0;
        for (let j = i; j < sortedTrades.length; j++) {
          if (sortedTrades[j].outcome === "loss") {
            break;
          }
          tradesUntilStop++;
        }
        tradesAfterStreaks += i - streakStartIdx;
      }
      longestStreak = Math.max(longestStreak, currentStreak);
      currentStreak = 0;
      inStreak = false;
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  const avgTradesAfterStreak =
    streaksEnded > 0 ? tradesAfterStreaks / streaksEnded : 0;

  return {
    type: "losing_streak",
    detected: totalStreaks > 0,
    occurrences: totalStreaks,
    estimatedLoss: streakLosses,
    details: {
      longestStreak,
      avgTradesAfterStreak,
      totalStreaks,
    } as LosingStreakDetails,
  };
}

function detectBadHours(trades: Trade[]): Pattern {
  let offHoursTrades = 0;
  let offHoursLosses = 0;
  let offHoursLossCount = 0;
  let normalHoursLossCount = 0;
  let normalHoursTrades = 0;

  for (const trade of trades) {
    const hour = getHourFromTimestamp(trade.timestamp);

    if (isBadHour(hour)) {
      offHoursTrades++;
      if (trade.outcome === "loss") {
        offHoursLossCount++;
        offHoursLosses += Math.abs(trade.pnl);
      }
    } else {
      normalHoursTrades++;
      if (trade.outcome === "loss") {
        normalHoursLossCount++;
      }
    }
  }

  const offHoursLossRate =
    offHoursTrades > 0 ? (offHoursLossCount / offHoursTrades) * 100 : 0;
  const normalLossRate =
    normalHoursTrades > 0
      ? (normalHoursLossCount / normalHoursTrades) * 100
      : 0;
  const lossMultiplier =
    normalLossRate > 0 ? offHoursLossRate / normalLossRate : 1;

  return {
    type: "bad_hours",
    detected: offHoursTrades > 0 && lossMultiplier > 1.5,
    occurrences: offHoursTrades,
    estimatedLoss: offHoursLosses,
    details: {
      offHoursTrades,
      offHoursLossRate,
      lossMultiplier,
      badHoursRange: { start: BAD_HOURS_START, end: BAD_HOURS_END },
    } as BadHoursDetails,
  };
}

function detectTiltSizing(trades: Trade[]): Pattern {
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  const sizes = trades.map((t) => Math.abs(t.amountIn));
  const avgSize =
    sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

  let tiltTradesCount = 0;
  let tiltLosses = 0;
  let tiltLossCount = 0;
  let normalWins = 0;
  let normalTrades = 0;
  let totalSizeIncrease = 0;

  for (let i = 1; i < sortedTrades.length; i++) {
    const prevTrade = sortedTrades[i - 1];
    const currTrade = sortedTrades[i];
    const currSize = Math.abs(currTrade.amountIn);
    const prevSize = Math.abs(prevTrade.amountIn);

    if (prevTrade.outcome === "loss" && prevSize > 0) {
      const sizeIncrease = currSize / prevSize;

      if (sizeIncrease >= TILT_SIZE_INCREASE_THRESHOLD) {
        tiltTradesCount++;
        totalSizeIncrease += sizeIncrease;

        if (currTrade.outcome === "loss") {
          tiltLossCount++;
          const excessSize = currSize - avgSize;
          const excessLoss =
            excessSize > 0
              ? (excessSize / currSize) * Math.abs(currTrade.pnl)
              : 0;
          tiltLosses += excessLoss;
        }
      }
    }

    if (currSize <= avgSize * 1.2) {
      normalTrades++;
      if (currTrade.outcome === "win") {
        normalWins++;
      }
    }
  }

  const avgSizeIncrease =
    tiltTradesCount > 0 ? totalSizeIncrease / tiltTradesCount : 1;
  const winRateAtTiltSize =
    tiltTradesCount > 0
      ? ((tiltTradesCount - tiltLossCount) / tiltTradesCount) * 100
      : 0;
  const normalWinRate =
    normalTrades > 0 ? (normalWins / normalTrades) * 100 : 50;

  return {
    type: "tilt_sizing",
    detected:
      tiltTradesCount > 0 && avgSizeIncrease >= TILT_SIZE_INCREASE_THRESHOLD,
    occurrences: tiltTradesCount,
    estimatedLoss: tiltLosses,
    details: {
      avgSizeIncrease,
      winRateAtTiltSize,
      normalWinRate,
      tiltTradesCount,
    } as TiltSizingDetails,
  };
}

export function analyzePatterns(trades: Trade[]): Pattern[] {
  if (trades.length === 0) {
    return [];
  }

  return [
    detectRevengeTrading(trades),
    detectOvertrading(trades),
    detectLosingStreaks(trades),
    detectBadHours(trades),
    detectTiltSizing(trades),
  ];
}

export function calculateTraderStats(
  trades: Trade[],
  patterns: Pattern[]
): TraderStats {
  if (trades.length === 0) {
    return {
      discipline: 50,
      patience: 50,
      consistency: 50,
      timing: 50,
      riskControl: 50,
      endurance: 50,
      totalTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgTradeSize: 0,
      tradingDays: 0,
    };
  }

  const wins = trades.filter((t) => t.outcome === "win").length;
  const winRate = (wins / trades.length) * 100;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgTradeSize =
    trades.reduce((sum, t) => sum + Math.abs(t.amountIn), 0) / trades.length;

  const tradingDaysSet = new Set(trades.map((t) => getDayKey(t.timestamp)));
  const tradingDays = tradingDaysSet.size;

  const revengePattern = patterns.find((p) => p.type === "revenge_trading");
  const overtradingPattern = patterns.find((p) => p.type === "overtrading");
  const losingStreakPattern = patterns.find((p) => p.type === "losing_streak");
  const badHoursPattern = patterns.find((p) => p.type === "bad_hours");
  const tiltPattern = patterns.find((p) => p.type === "tilt_sizing");

  let discipline = 80;
  if (losingStreakPattern?.detected) {
    const details = losingStreakPattern.details as LosingStreakDetails;
    discipline -= Math.min(40, details.totalStreaks * 10);
  }

  let patience = 80;
  if (revengePattern?.detected) {
    const details = revengePattern.details as RevengeDetails;
    patience -= Math.min(50, details.percentageAfterLoss * 0.7);
  }

  let consistency = 80;
  if (tiltPattern?.detected) {
    const details = tiltPattern.details as TiltSizingDetails;
    const sizeVariance = (details.avgSizeIncrease - 1) * 100;
    consistency -= Math.min(40, sizeVariance);
  }

  let timing = 80;
  if (badHoursPattern?.detected) {
    const details = badHoursPattern.details as BadHoursDetails;
    const offHoursRatio = details.offHoursTrades / trades.length;
    timing -= Math.min(40, offHoursRatio * 100);
  }

  let riskControl = 80;
  if (tiltPattern?.detected) {
    const details = tiltPattern.details as TiltSizingDetails;
    riskControl -= Math.min(40, (details.avgSizeIncrease - 1) * 50);
  }

  let endurance = 80;
  if (overtradingPattern?.detected) {
    const details = overtradingPattern.details as OvertradingDetails;
    endurance -= Math.min(40, details.daysOver10Trades * 5);
  }

  const clamp = (val: number) => Math.max(0, Math.min(99, Math.round(val)));

  return {
    discipline: clamp(discipline),
    patience: clamp(patience),
    consistency: clamp(consistency),
    timing: clamp(timing),
    riskControl: clamp(riskControl),
    endurance: clamp(endurance),
    totalTrades: trades.length,
    winRate: Math.round(winRate * 10) / 10,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgTradeSize: Math.round(avgTradeSize * 100) / 100,
    tradingDays,
  };
}

export function calculateOverallRating(stats: TraderStats): number {
  const rating =
    stats.discipline * 0.25 +
    stats.patience * 0.2 +
    stats.consistency * 0.15 +
    stats.timing * 0.15 +
    stats.riskControl * 0.15 +
    stats.endurance * 0.1;

  return Math.round(Math.max(0, Math.min(99, rating)));
}

export function getTier(rating: number): Tier {
  if (rating >= 90) return "legendary";
  if (rating >= 80) return "epic";
  if (rating >= 70) return "rare";
  if (rating >= 60) return "uncommon";
  if (rating >= 40) return "common";
  return "bronze";
}

export function getTierInfo(rating: number): TierInfo {
  const tier = getTier(rating);

  const tierMap: Record<Tier, TierInfo> = {
    legendary: {
      tier: "legendary",
      color: "gold",
      label: "Legendary",
      description: "Elite discipline",
    },
    epic: {
      tier: "epic",
      color: "purple",
      label: "Epic",
      description: "Strong trader",
    },
    rare: {
      tier: "rare",
      color: "blue",
      label: "Rare",
      description: "Above average",
    },
    uncommon: {
      tier: "uncommon",
      color: "green",
      label: "Uncommon",
      description: "Room to improve",
    },
    common: {
      tier: "common",
      color: "silver",
      label: "Common",
      description: "Needs work",
    },
    bronze: {
      tier: "bronze",
      color: "bronze",
      label: "Bronze",
      description: "Degen status",
    },
  };

  return tierMap[tier];
}

export function generateRecommendations(
  patterns: Pattern[],
  trades: Trade[]
): RecommendedRules {
  const rules: RecommendedRule[] = [];

  const losingStreakPattern = patterns.find((p) => p.type === "losing_streak");
  if (losingStreakPattern?.detected) {
    const dayLosses = new Map<string, number>();
    for (const trade of trades) {
      if (trade.outcome === "loss") {
        const dayKey = getDayKey(trade.timestamp);
        dayLosses.set(
          dayKey,
          (dayLosses.get(dayKey) || 0) + Math.abs(trade.pnl)
        );
      }
    }

    const lossValues = Array.from(dayLosses.values()).sort((a, b) => a - b);
    const medianIdx = Math.floor(lossValues.length * 0.5);
    const recommendedLimit =
      lossValues.length > 0 ? lossValues[medianIdx] : 200;

    rules.push({
      type: "daily_loss_limit",
      label: "Daily Loss Limit",
      value: Math.round(recommendedLimit),
      unit: "USD",
      estimatedSavings: losingStreakPattern.estimatedLoss * 0.6,
      priority: "required",
      rationale: `Stop trading after $${Math.round(recommendedLimit)} loss`,
    });
  }

  const revengePattern = patterns.find((p) => p.type === "revenge_trading");
  if (revengePattern?.detected) {
    const details = revengePattern.details as RevengeDetails;
    const cooldownMinutes = Math.max(
      15,
      Math.min(60, Math.round(details.avgTimeAfterLoss * 2))
    );

    rules.push({
      type: "cooldown",
      label: "Cooldown After Loss",
      value: cooldownMinutes,
      unit: "minutes",
      estimatedSavings: revengePattern.estimatedLoss * 0.8,
      priority: "recommended",
      rationale: `Wait ${cooldownMinutes} minutes after any losing trade`,
    });
  }

  const tiltPattern = patterns.find((p) => p.type === "tilt_sizing");
  if (tiltPattern?.detected) {
    const avgSize =
      trades.reduce((sum, t) => sum + Math.abs(t.amountIn), 0) / trades.length;
    const maxPosition = Math.round(avgSize * 0.8);

    rules.push({
      type: "max_position",
      label: "Max Position Size",
      value: maxPosition,
      unit: "USD",
      estimatedSavings: tiltPattern.estimatedLoss,
      priority: "recommended",
      rationale: `Maximum $${maxPosition} per trade to prevent tilt sizing`,
    });
  }

  const overtradingPattern = patterns.find((p) => p.type === "overtrading");
  if (overtradingPattern?.detected) {
    const details = overtradingPattern.details as OvertradingDetails;

    rules.push({
      type: "trade_limit",
      label: "Daily Trade Limit",
      value: details.optimalTradeCount.max,
      unit: "trades",
      estimatedSavings: overtradingPattern.estimatedLoss * 0.5,
      priority: "optional",
      rationale: `Maximum ${details.optimalTradeCount.max} trades per day`,
    });
  }

  const badHoursPattern = patterns.find((p) => p.type === "bad_hours");
  if (badHoursPattern?.detected) {
    const details = badHoursPattern.details as BadHoursDetails;

    rules.push({
      type: "time_restriction",
      label: "Time Restriction",
      value: `${details.badHoursRange.start}:00-${details.badHoursRange.end}:00`,
      unit: "",
      estimatedSavings: badHoursPattern.estimatedLoss * 0.9,
      priority: "recommended",
      rationale: `No trading between ${details.badHoursRange.start}:00 and ${details.badHoursRange.end}:00`,
    });
  }

  const totalEstimatedSavings = rules.reduce(
    (sum, r) => sum + r.estimatedSavings,
    0
  );

  return {
    rules: rules.sort((a, b) => {
      const priorityOrder = { required: 0, recommended: 1, optional: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    totalEstimatedSavings: Math.round(totalEstimatedSavings * 100) / 100,
  };
}

export function calculatePreventableLoss(patterns: Pattern[]): number {
  const total = patterns
    .filter((p) => p.detected)
    .reduce((sum, p) => sum + p.estimatedLoss, 0);

  return Math.round(total * 100) / 100;
}

export function getWeakness(stats: TraderStats): {
  stat: string;
  abbrev: string;
  value: number;
} {
  const statMap = [
    { stat: "Discipline", abbrev: "DIS", value: stats.discipline },
    { stat: "Patience", abbrev: "PAT", value: stats.patience },
    { stat: "Consistency", abbrev: "CON", value: stats.consistency },
    { stat: "Timing", abbrev: "TIM", value: stats.timing },
    { stat: "Risk Control", abbrev: "RSK", value: stats.riskControl },
    { stat: "Endurance", abbrev: "END", value: stats.endurance },
  ];

  return statMap.reduce((min, curr) => (curr.value < min.value ? curr : min));
}

export function getStrength(stats: TraderStats): {
  stat: string;
  abbrev: string;
  value: number;
} {
  const statMap = [
    { stat: "Discipline", abbrev: "DIS", value: stats.discipline },
    { stat: "Patience", abbrev: "PAT", value: stats.patience },
    { stat: "Consistency", abbrev: "CON", value: stats.consistency },
    { stat: "Timing", abbrev: "TIM", value: stats.timing },
    { stat: "Risk Control", abbrev: "RSK", value: stats.riskControl },
    { stat: "Endurance", abbrev: "END", value: stats.endurance },
  ];

  return statMap.reduce((max, curr) => (curr.value > max.value ? curr : max));
}

export function getPatternLabel(type: PatternType): string {
  const labels: Record<PatternType, string> = {
    revenge_trading: "Revenge Trading",
    overtrading: "Overtrading",
    losing_streak: "Losing Streaks",
    bad_hours: "Bad Hours",
    tilt_sizing: "Tilt Sizing",
  };
  return labels[type];
}

export function getPatternDescription(pattern: Pattern): string {
  if (!pattern.detected) {
    return "Not detected";
  }

  switch (pattern.type) {
    case "revenge_trading": {
      const details = pattern.details as RevengeDetails;
      return `You trade within 5 min of losses ${Math.round(details.percentageAfterLoss)}% of the time. These trades lose ${Math.round(details.followUpLossRate)}% of the time.`;
    }
    case "overtrading": {
      const details = pattern.details as OvertradingDetails;
      return `${details.daysOver10Trades} days with 10+ trades. P&L is negative ${Math.round(details.lossRateOnHighDays)}% on these days.`;
    }
    case "losing_streak": {
      const details = pattern.details as LosingStreakDetails;
      return `${details.totalStreaks} losing streaks of 3+ losses. Longest streak: ${details.longestStreak}.`;
    }
    case "bad_hours": {
      const details = pattern.details as BadHoursDetails;
      return `${details.offHoursTrades} trades during ${details.badHoursRange.start}:00-${details.badHoursRange.end}:00. You lose ${details.lossMultiplier.toFixed(1)}x more.`;
    }
    case "tilt_sizing": {
      const details = pattern.details as TiltSizingDetails;
      return `Position size increases ${details.avgSizeIncrease.toFixed(1)}x after losses. Win rate drops from ${Math.round(details.normalWinRate)}% to ${Math.round(details.winRateAtTiltSize)}%.`;
    }
    default:
      return "";
  }
}
