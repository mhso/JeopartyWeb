import type { Contestant, PowerUpType } from "@shared/types";

export type ContestantInfo = Partial<{
    id: string;
    score: number;
    hits: number;
    misses: number;
    powers: Record<PowerUpType, boolean>;
}>

export function applyContestantEdit(contestant: Contestant | undefined, info: ContestantInfo) {
    if (!contestant) return;
    if (info.score !== undefined) contestant.score = info.score;
    if (info.hits !== undefined) contestant.hits = info.hits;
    if (info.misses !== undefined) contestant.misses = info.misses;
    if (info.powers) {
        for (const power of contestant.power_ups) {
            const used = info.powers[power.type];
            if (used !== undefined) power.used = used;
        }
    }
}