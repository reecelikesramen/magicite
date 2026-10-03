/** Progression public API: XP & level-ups, skills, companions, the Blight Wraith, creation helpers. */
export { grantXp, levelUp, progressionSystem, STAT_KEYS, totalXpForLevel, xpForLevel } from './xp';
export { chooseSkill, makeSkillOffer, maxRank, refreshSkillOffer } from './offers';
export { EFFECTS, resetSkillCooldowns, SKILL_FX, skillPower, spawnSkillProjectile, tryActivateSkill } from './skills';
export { COMPANION, companionOf, spawnCompanions } from './companions';
export { spawnWraith, WRAITH, wraithEntity, wraithSpawnTick, wraithSpeed } from './wraith';
export { applyDifficultyToLevel, difficultyMul, runDifficulty, scaleEnemyDamage, type Difficulty, type DifficultyMul } from './difficulty';
export * from './creation';
