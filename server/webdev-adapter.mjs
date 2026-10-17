import { createRequire as createCityRoutesRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DUEL_MATCH_COUNT, DUEL_TIER_FRAGMENTS, DUEL_USER_THRESHOLD, duelDeckPower, pickDuelMatches } from "./duel-match.mjs";
import { neutralRaidPower, resolveNeutralRaid } from './neutral-raid.mjs';
import { isLaunched } from './launch.mjs';
import { attendanceLedger, nextAttendanceDay } from './attendance.mjs';
import { RAID_DAILY_LIMIT, RAID_SQUADS, previousRaidWeekKey, raidBossLevel, raidDamageCap, raidDayKey, raidRewardFor, raidWeekKey } from "./raid.mjs";
const cityRoutes = createCityRoutesRequire(import.meta.url)('./city-routes.json');
// starters/web-db-user-v1/shared/const.ts
var COOKIE_NAME = "webdev_app_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// starters/web-db-user-v1/server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// starters/web-db-user-v1/server/db.ts
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// starters/web-db-user-v1/drizzle/schema.ts
import { bigint, int, mediumtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { scenarioGold } from './economy.mjs';
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var gameAccountStates = mysqlTable("game_account_states", {
  userId: int("userId").primaryKey(),
  honor: int("honor").default(2480).notNull(),
  silver: int("silver").default(12500).notNull(),
  gold: int("gold").default(0).notNull(),
  manuals: int("manuals").default(180).notNull(),
  wins: int("wins").default(7).notNull(),
  battleScore: int("battleScore").default(18460).notNull(),
  grain: int("grain").default(18200).notNull(),
  wood: int("wood").default(8200).notNull(),
  iron: int("iron").default(3900).notNull(),
  influence: int("influence").default(2480).notNull(),
  faction: mysqlEnum("faction", ["촉한", "위나라", "오나라"]).default("촉한").notNull(),
  factionChosen: int("factionChosen").default(0).notNull(),
  factionWarScore: int("factionWarScore").default(0).notNull(),
  luoyangBoxes: int("luoyangBoxes").default(0).notNull(),
  lastLuoyangReward: int("lastLuoyangReward"),
  luoyangRewardWeekKey: varchar("luoyangRewardWeekKey", { length: 16 }),
  mythicFragments: int("mythicFragments").default(0).notNull(),
  mythicStones: int("mythicStones").default(0).notNull(),
  grantLedger: mediumtext("grantLedger"),
  duelAttemptsToday: int("duelAttemptsToday").default(0).notNull(),
  duelDayKey: varchar("duelDayKey", { length: 16 }),
  prelaunchGoldDayKey: varchar("prelaunchGoldDayKey", { length: 16 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  generalData: mediumtext("generalData"),
  formationData: mediumtext("formationData"),
  citiesData: mediumtext("citiesData"),
  researchData: mediumtext("researchData"),
  equipmentData: mediumtext("equipmentData"),
  equipmentLoadoutsData: mediumtext("equipmentLoadoutsData"),
  selectedEquipmentGeneralId: varchar("selectedEquipmentGeneralId", { length: 64 }),
  selectedCityId: varchar("selectedCityId", { length: 64 }),
  incomeCollectedAt: varchar("incomeCollectedAt", { length: 32 }),
  conquestAt: varchar("conquestAt", { length: 32 }),
  scenarioData: mediumtext("scenarioData"),
  missionData: mediumtext("missionData"),
  squadData: mediumtext("squadData")
});
var factionTerritoryStates = mysqlTable("faction_territory_states", {
  cityId: varchar("cityId", { length: 64 }).primaryKey(),
  owner: mysqlEnum("owner", ["촉한", "위나라", "오나라", "중립"]).notNull(),
  conquestProgress: int("conquestProgress").default(0).notNull(),
  defense: int("defense").default(10000).notNull(),
  prosperity: int("prosperity").default(50).notNull(),
  version: int("version").default(1).notNull(),
  updatedByUserId: int("updatedByUserId"),
  garrisonsData: mediumtext("garrisonsData"),
  lastRaidData: text("lastRaidData"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var cityDamageRankings = mysqlTable("city_damage_rankings", {
  cityId: varchar("cityId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  faction: mysqlEnum("faction", ["촉한", "위나라", "오나라"]).notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  totalDamage: bigint("totalDamage", { mode: "number" }).default(0).notNull(),
  battleCount: int("battleCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, table => ({ pk: primaryKey({ columns: [table.cityId, table.userId] }) }));
var factionTerritoryAiState = mysqlTable("faction_territory_ai_state", {
  id: int("id").primaryKey(),
  lastTickAt: timestamp("lastTickAt")
});
var neutralAiBattleLogs = mysqlTable("neutral_ai_battle_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  cityId: varchar("cityId", { length: 64 }).notNull(),
  occurredAt: timestamp("occurredAt", { fsp: 3 }).notNull(),
  attackerName: varchar("attackerName", { length: 128 }).notNull(),
  attackerKind: mysqlEnum("attackerKind", ["user", "ai"]).default("ai").notNull(),
  defenderName: varchar("defenderName", { length: 128 }).notNull(),
  won: int("won").default(0).notNull(),
  damage: int("damage").default(0).notNull(),
  note: text("note").notNull()
});
var raidWeeklyScores = mysqlTable("raid_weekly_scores", {
  weekKey: varchar("weekKey", { length: 16 }).notNull(),
  userId: int("userId").notNull(),
  displayName: varchar("displayName", { length: 128 }).default("").notNull(),
  totalDamage: bigint("totalDamage", { mode: "number" }).default(0).notNull(),
  bestDamage: bigint("bestDamage", { mode: "number" }).default(0).notNull(),
  attempts: int("attempts").default(0).notNull(),
  dayKey: varchar("dayKey", { length: 16 }),
  dayAttempts: int("dayAttempts").default(0).notNull(),
  pendingToken: varchar("pendingToken", { length: 64 }),
  /** 진행 중 도전의 피해 상한(도전 시작 때 저장된 1·2·3군 전력으로 계산) */
  pendingPower: int("pendingPower").default(0).notNull(),
  rewardClaimed: int("rewardClaimed").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, table => ({ pk: primaryKey({ columns: [table.weekKey, table.userId] }) }));
var luoyangWeeklyResults = mysqlTable("luoyang_weekly_results", {
  weekKey: varchar("weekKey", { length: 16 }).primaryKey(),
  winnerFaction: mysqlEnum("winnerFaction", ["촉한", "위나라", "오나라"]),
  settledAt: timestamp("settledAt").defaultNow().notNull()
});

// starters/web-db-user-v1/server/_core/env.ts
var ENV = {
  get appId() {
    return process.env.MANUS_PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.MANUS_JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.MANUS_OAUTH_API_URL ?? "";
  },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get adminEmail() {
    return "donto333@gmail.com";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  }
};

// starters/web-db-user-v1/server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || user.email?.trim().toLowerCase() === ENV.adminEmail) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserName(openId, name) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  await db.update(users).set({ name }).where(eq(users.openId, openId));
  return getUserByOpenId(openId);
}
/** 같은 이름(대소문자 무시)의 계정이 있는가(게스트 아이디 중복 확인) */
async function findUserByName(name) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: users.id }).from(users).where(sql`LOWER(${users.name}) = ${String(name).toLowerCase()}`).limit(1);
  return rows[0] ?? null;
}
/** 게스트 계정 만들기(Manus 로그인 없이, openId는 guest_로 시작) */
async function createGuestUser(openId, name) {
  await upsertUser({ openId, name, email: null, loginMethod: "guest", lastSignedIn: new Date() });
  return getUserByOpenId(openId);
}
/** 세션 쿠키(OAuth 로그인과 같은 설정) */
function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
}
async function listUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(users).limit(200);
}
async function updateUserRole(id, role, actorOpenId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const target = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target[0]) return void 0;
  if (target[0].openId === actorOpenId && role !== "admin") throw new Error("현재 관리자 계정의 관리자 권한은 스스로 해제할 수 없습니다.");
  await db.update(users).set({ role }).where(eq(users.id, id));
  clearOperatorCache();
  return getUserByOpenId(target[0].openId);
}
const defaultGameState = { honor: 2480, silver: 12500, gold: 0, manuals: 180, wins: 0, battleScore: 0, grain: 18200, wood: 8200, iron: 3900, influence: 2480, faction: "촉한", factionChosen: 0 };
const CITY_DEFENSE_BY_LEVEL = { 1: 10000, 2: 20000, 3: 50000, 4: 100000, 5: 1000000 };
const TERRITORY_TEST_WEAKENING_ENABLED = true;
const TERRITORY_TEST_WEAKENING_RATIO = 0.1;
function cityDefenseFloor(cityId) {
  const level = CITY_LEVEL_BY_ID[cityId] ?? 5;
  return 0;
}
function legacyCityDefenseFloor(cityId) {
  const level = CITY_LEVEL_BY_ID[cityId] ?? 5;
  return Math.ceil((CITY_DEFENSE_BY_LEVEL[level] ?? CITY_DEFENSE_BY_LEVEL[5]) * TERRITORY_TEST_WEAKENING_RATIO);
}
const CITY_LEVEL_BY_ID = {
  chengdu: 3, hanzhong: 2, xiangyang: 4, jianye: 3, xuchang: 3, luoyang: 5, ye: 4, chenliu: 2, puyang: 2, wancheng: 2,
  jiangling: 3, yiling: 2, changsha: 3, lingling: 1, guiyang: 1, wujun: 3, kuaiji: 2, poyang: 2, hefei: 3, shouchun: 3,
  jiujiang: 2, tianshui: 2, wuwei: 1, fucheng: 2, xindu: 1, changan: 4, meixian: 2, anding: 2, jinyang: 3, pingyuan: 2,
  beihai: 2, langya: 2, xiapi: 3, guangling: 2, lujiang: 2, shangyong: 2, xinye: 2, jiangxia: 2, wuling: 1, badong: 2,
  jianning: 1, yunnan: 1, jiaozhi: 1, shixing: 1, nanhai: 1, jianan: 1
};
function cityDefenseForLevel(level) { return CITY_DEFENSE_BY_LEVEL[level] ?? CITY_DEFENSE_BY_LEVEL[5]; }
const FACTION_TERRITORY_SEED = [
  ["chengdu", "촉한", 74, 82], ["hanzhong", "중립", 86, 64], ["xiangyang", "중립", 62, 58], ["jianye", "오나라", 70, 76], ["xuchang", "중립", 81, 79],
  ["luoyang", "중립", 92, 88], ["ye", "위나라", 86, 84], ["chenliu", "중립", 57, 61], ["puyang", "중립", 64, 58], ["wancheng", "중립", 70, 67],
  ["jiangling", "중립", 76, 73], ["yiling", "중립", 68, 55], ["changsha", "중립", 63, 71], ["lingling", "중립", 46, 49], ["guiyang", "중립", 52, 45],
  ["wujun", "중립", 73, 78], ["kuaiji", "중립", 66, 69], ["poyang", "중립", 59, 62], ["hefei", "중립", 88, 64], ["shouchun", "중립", 79, 68],
  ["jiujiang", "중립", 55, 57], ["tianshui", "중립", 71, 53], ["wuwei", "중립", 61, 42], ["fucheng", "중립", 58, 51], ["xindu", "중립", 49, 47],
  ["changan", "중립", 88, 86], ["meixian", "중립", 64, 55], ["anding", "중립", 62, 48], ["jinyang", "중립", 75, 63], ["pingyuan", "중립", 58, 59],
  ["beihai", "중립", 60, 61], ["langya", "중립", 63, 57], ["xiapi", "중립", 72, 70], ["guangling", "중립", 61, 65], ["lujiang", "중립", 66, 60],
  ["shangyong", "중립", 70, 52], ["xinye", "중립", 59, 58], ["jiangxia", "중립", 65, 64], ["wuling", "중립", 50, 46], ["badong", "중립", 67, 50],
  ["jianning", "중립", 54, 42], ["yunnan", "중립", 52, 39], ["jiaozhi", "중립", 48, 44], ["shixing", "중립", 47, 41], ["nanhai", "중립", 45, 43],
  ["jianan", "중립", 46, 44]
].map(([cityId, owner, _legacyDefense, prosperity]) => ({ cityId, owner, conquestProgress: 0, defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[cityId]), prosperity, version: 1 }));
const FACTION_TERRITORY_IDS = new Set(FACTION_TERRITORY_SEED.map(city => city.cityId));
const NEUTRAL_AI_TICK_MS = 10 * 60 * 1000;
const PROTECTED_CAPITAL_IDS = new Set(["chengdu", "ye", "jianye"]);
const LUOYANG_CITY_ID = "luoyang";
// 도시 진군로: server/city-routes.json(클라이언트와 같은 원본)에서 양방향 인접 목록을 만든다.
const CITY_ADJACENCY = (() => {
  const map = {};
  for (const id of cityRoutes.isolated ?? []) map[id] = [];
  for (const [a, b] of cityRoutes.edges) {
    (map[a] ??= []).push(b);
    (map[b] ??= []).push(a);
  }
  return map;
})();
function luoyangSeoulParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), hour: Number(value.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday) };
}
function isLuoyangWindowOpen(now = Date.now()) {
  const parts = luoyangSeoulParts(now);
  return parts.weekday === 0 && parts.hour >= 20 && parts.hour < 24;
}
function luoyangSettledWeekKey(now = Date.now()) {
  const parts = luoyangSeoulParts(now);
  const previousSunday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - (parts.weekday === 0 ? 7 : parts.weekday)));
  return previousSunday.toISOString().slice(0, 10);
}
function parseStateJson(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
// ── 운영자 계정: 랭킹 · 영토전 · 레이드 순위 · 대련 상대 · 레이드 보스 레벨에 영향을 주지 않는다 ──
function isOperatorUser(user) {
  if (!user) return false;
  return user.role === "admin" || Boolean(ENV.adminEmail && String(user.email ?? "").trim().toLowerCase() === ENV.adminEmail);
}
let operatorCache = { at: 0, ids: new Set() };
/** 운영자 계정 id 목록(1분 캐시) */
async function operatorUserIds(db) {
  if (Date.now() - operatorCache.at < 60 * 1000) return operatorCache.ids;
  const rows = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(sql`${users.role} = 'admin' OR LOWER(TRIM(${users.email})) = ${ENV.adminEmail}`);
  operatorCache = { at: Date.now(), ids: new Set(rows.filter(isOperatorUser).map(row => row.id)) };
  return operatorCache.ids;
}
function clearOperatorCache() { operatorCache = { at: 0, ids: new Set() }; }
/** 관리자가 고친 값: 접속 중인 클라이언트가 옛 값으로 덮어쓰지 않게 10분 동안 저장값을 이 값으로 바꾸고, 클라이언트가 받아들였다고(ack) 알리면 지운다 */
const ADMIN_PATCH_TTL_MS = 10 * 60 * 1000;
function activeAdminPatch(ledger, now = Date.now()) {
  const patch = ledger?.adminPatch;
  if (!patch || typeof patch !== "object" || !patch.id || !patch.values) return null;
  return now - Number(patch.at || 0) < ADMIN_PATCH_TTL_MS ? patch : null;
}
function gameStateView(row) {
  const { generalData, formationData, citiesData, researchData, equipmentData, equipmentLoadoutsData, scenarioData, missionData, squadData, grantLedger, ...base } = row;
  const patch = activeAdminPatch(parseStateJson(grantLedger));
  return {
    ...base,
    adminPatchId: patch?.id ?? null,
    generals: parseStateJson(generalData),
    formation: parseStateJson(formationData),
    cities: parseStateJson(citiesData),
    research: parseStateJson(researchData),
    equipmentInventory: parseStateJson(equipmentData),
    equipmentLoadouts: parseStateJson(equipmentLoadoutsData),
    scenarioCleared: parseStateJson(scenarioData),
    missions: parseStateJson(missionData),
    reserveSquads: parseStateJson(squadData),
    selectedEquipmentGeneralId: row.selectedEquipmentGeneralId ?? null,
    selectedCityId: row.selectedCityId ?? null,
    lastIncomeCollectedAt: row.incomeCollectedAt ? Number(row.incomeCollectedAt) : undefined,
    lastConquestAt: row.conquestAt ? Number(row.conquestAt) : undefined
  };
}
async function getGameState(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  return gameStateView(result[0] ?? { userId, ...defaultGameState, updatedAt: new Date() });
}
// ── 수비대·습격 기록 (server/021_city_garrisons.sql) ──
const MAX_CITY_GARRISONS = 100;
function parseGarrisons(row) {
  try {
    const data = row?.garrisonsData ? JSON.parse(row.garrisonsData) : null;
    const list = Array.isArray(data?.list) ? data.list.filter(g => g && typeof g.id === "string" && Number.isFinite(Number(g.power))).slice(0, MAX_CITY_GARRISONS) : [];
    const defeated = Math.max(0, Math.min(list.length, Math.trunc(Number(data?.defeated) || 0)));
    return { list, defeated };
  } catch {
    return { list: [], defeated: 0 };
  }
}
function serializeGarrisons(garrisons) {
  return garrisons.list.length ? JSON.stringify({ list: garrisons.list, defeated: garrisons.defeated }) : null;
}
function parseLastRaid(row) {
  try { return row?.lastRaidData ? JSON.parse(row.lastRaidData) : null; } catch { return null; }
}
/** 중립 습격대가 이 도시를 칠 때의 전력: 맞닿은 중립 도시 중 가장 높은 레벨 기준 */
function strongestNeutralNeighborLevel(cityId, byCityId) {
  const levels = (CITY_ADJACENCY[cityId] ?? []).filter(id => (byCityId.get(id)?.owner ?? "중립") === "중립").map(id => CITY_LEVEL_BY_ID[id] ?? 1);
  return levels.length ? Math.max(...levels) : 0;
}
/** 잠근(row FOR UPDATE) 도시에 습격 한 번을 적용할 값 묶음을 만든다. */
function applyRaidToRow(target, attackerCityId, attackerLevel, now, { allowCapture = true, updatedByUserId = null } = {}) {
  const garrisons = parseGarrisons(target);
  const raidPower = neutralRaidPower(attackerLevel);
  const result = resolveNeutralRaid({ raidPower, garrisonPowers: garrisons.list.map(g => Number(g.power)), defeated: garrisons.defeated, defense: Number(target.defense), allowCapture });
  const defender = result.defenderIndex >= 0 ? garrisons.list[result.defenderIndex] : null;
  const lastRaid = { at: now, attackerCityId, attackerLevel, raidPower, attackerWon: result.attackerWon, damage: result.damage, defenderLabel: defender?.label ?? null, captured: result.captured };
  const set = {
    lastRaidData: JSON.stringify(lastRaid),
    version: sql`${factionTerritoryStates.version} + 1`,
    updatedByUserId
  };
  if (result.attackerWon) {
    set.owner = result.captured ? "중립" : target.owner;
    set.conquestProgress = result.captured ? 0 : Math.min(100, Number(target.conquestProgress) + result.damage);
    set.defense = result.captured ? cityDefenseForLevel(CITY_LEVEL_BY_ID[target.cityId]) : result.defense;
    set.prosperity = result.captured ? Math.max(25, Number(target.prosperity) - 15) : Math.max(20, Number(target.prosperity) - 3);
    set.garrisonsData = result.captured ? null : serializeGarrisons({ list: garrisons.list, defeated: result.defeated });
  }
  return { set, result, lastRaid };
}

function factionTerritoryView(row, battleLogs = []) {
  const garrisons = parseGarrisons(row);
  return {
    garrisons: { list: garrisons.list.map(({ id, power, averageLevel, label }) => ({ id, power: Number(power), averageLevel: Number(averageLevel) || 1, label: String(label ?? "") })), defeated: garrisons.defeated },
    lastRaid: parseLastRaid(row),
    cityId: row.cityId,
    owner: row.owner,
    conquestProgress: Math.max(0, Math.min(100, Number(row.conquestProgress) || 0)),
    defense: Math.max(0, Math.min(CITY_DEFENSE_BY_LEVEL[5], Number(row.defense) || 0)),
    prosperity: Math.max(0, Math.min(100, Number(row.prosperity) || 0)),
    battleLogs: battleLogs.slice(-30).map(log => ({
      id: `server-ai-${log.id}`,
      timestamp: new Date(log.occurredAt).getTime(),
      attackerName: log.attackerName,
      attackerKind: log.attackerKind,
      defenderName: log.defenderName,
      won: Boolean(log.won),
      damage: Math.max(0, Number(log.damage) || 0),
      note: log.note
    })),
    version: Number(row.version) || 1,
    updatedAt: row.updatedAt
  };
}
async function ensureFactionTerritories(db) {
  const existing = await db.select({ cityId: factionTerritoryStates.cityId, defense: factionTerritoryStates.defense, conquestProgress: factionTerritoryStates.conquestProgress }).from(factionTerritoryStates);
  const known = new Set(existing.map(row => row.cityId));
  const missing = FACTION_TERRITORY_SEED.filter(city => !known.has(city.cityId)).map(city => ({ ...city, defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[city.cityId] ?? 1) }));
  if (missing.length) {
    await db.insert(factionTerritoryStates).values(missing).onDuplicateKeyUpdate({ set: { cityId: sql`cityId` } });
  }
  for (const row of existing) {
    const floor = legacyCityDefenseFloor(row.cityId);
    // 이전 버전이 모든 도시를 약화 하한에서 시작시킨 경우만 원래 최대치로 복구한다.
    // 이미 공성 진전이 있는 도시는 현재 방어도를 그대로 보존한다.
    if (Number(row.defense) === floor && Number(row.conquestProgress) === 0) {
      await db.update(factionTerritoryStates).set({ defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[row.cityId] ?? 1) }).where(eq(factionTerritoryStates.cityId, row.cityId));
    }
  }
}
async function advanceNeutralTerritoryAi(db, now = Date.now()) {
  const shouldTick = await db.transaction(async tx => {
    const rows = await tx.select().from(factionTerritoryAiState).where(eq(factionTerritoryAiState.id, 1)).limit(1).for("update");
    const current = rows[0];
    const lastTick = current?.lastTickAt ? new Date(current.lastTickAt).getTime() : 0;
    if (current && now - lastTick < NEUTRAL_AI_TICK_MS) return false;
    if (current) await tx.update(factionTerritoryAiState).set({ lastTickAt: new Date(now) }).where(eq(factionTerritoryAiState.id, 1));
    else await tx.insert(factionTerritoryAiState).values({ id: 1, lastTickAt: new Date(now) });
    return true;
  });
  if (!shouldTick) return 0;
  const rows = await db.select().from(factionTerritoryStates);
  const byCityId = new Map(rows.map(row => [row.cityId, row]));
  const attacks = [];
  for (const attacker of rows.filter(row => row.owner === "중립")) {
    const target = (CITY_ADJACENCY[attacker.cityId] ?? [])
      .map(cityId => byCityId.get(cityId))
      .filter(row => row && row.owner !== "중립" && !PROTECTED_CAPITAL_IDS.has(row.cityId))
      .sort((left, right) => Number(left.defense) - Number(right.defense))[0];
    if (target) attacks.push({ attacker: attacker.cityId, target: target.cityId });
  }
  if (!attacks.length) return 0;
  await db.transaction(async tx => {
    for (const attack of attacks) {
      const locked = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, attack.target)).limit(1).for("update");
      const target = locked[0];
      if (!target || target.owner === "중립" || PROTECTED_CAPITAL_IDS.has(target.cityId)) continue;
      // 수비대가 있으면 실제로 싸운다. 수비대가 이기면 방어도는 깎이지 않는다(neutral-raid.mjs).
      const { set, lastRaid } = applyRaidToRow(target, attack.attacker, CITY_LEVEL_BY_ID[attack.attacker] ?? 1, now);
      await tx.update(factionTerritoryStates).set(set).where(eq(factionTerritoryStates.cityId, target.cityId));
      await tx.insert(neutralAiBattleLogs).values({
        cityId: target.cityId,
        occurredAt: new Date(now),
        attackerName: "중립 인공지능 습격대",
        attackerKind: "ai",
        defenderName: lastRaid.defenderLabel ?? target.owner,
        won: lastRaid.attackerWon ? 1 : 0,
        damage: lastRaid.damage,
        note: !lastRaid.attackerWon ? `수비대 ${lastRaid.defenderLabel ?? ''}가 습격을 막았습니다.` : lastRaid.captured ? `성벽 방어도 -${lastRaid.damage} · 도시가 중립으로 전환되었습니다.` : `성벽 방어도 -${lastRaid.damage}`
      });
    }
  });
  return attacks.length;
}
async function settleLuoyangWeek(db, now = Date.now()) {
  const weekKey = luoyangSettledWeekKey(now);
  const existing = await db.select().from(luoyangWeeklyResults).where(eq(luoyangWeeklyResults.weekKey, weekKey)).limit(1);
  if (existing[0]) return { weekKey, winnerFaction: existing[0].winnerFaction };
  const city = await db.select({ owner: factionTerritoryStates.owner }).from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, LUOYANG_CITY_ID)).limit(1);
  const winnerFaction = city[0]?.owner && city[0].owner !== "중립" ? city[0].owner : null;
  await db.insert(luoyangWeeklyResults).values({ weekKey, winnerFaction }).onDuplicateKeyUpdate({ set: { weekKey: sql`weekKey` } });
  return { weekKey, winnerFaction };
}
async function grantLuoyangBox(db, userId, now = Date.now()) {
  const settlement = await settleLuoyangWeek(db, now);
  if (!settlement.winnerFaction) return false;
  return db.transaction(async tx => {
    const rows = await tx.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
    const account = rows[0];
    if (!account || account.faction !== settlement.winnerFaction || account.luoyangRewardWeekKey === settlement.weekKey) return false;
    const reward = 10 + Math.floor(Math.random() * 91);
    await tx.update(gameAccountStates).set({ luoyangBoxes: sql`${gameAccountStates.luoyangBoxes} + 1`, mythicStones: sql`${gameAccountStates.mythicStones} + 1`, lastLuoyangReward: reward, gold: sql`${gameAccountStates.gold} + ${reward}`, luoyangRewardWeekKey: settlement.weekKey }).where(eq(gameAccountStates.userId, userId));
    return true;
  });
}
/** 낙양전 기록: 최근 12주 승자와 낙양 누적 공헌(진영별 성벽 피해·출정 수, 상위 장수 5명) */
async function getLuoyangHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await settleLuoyangWeek(db);
  const weeks = await db.select({ weekKey: luoyangWeeklyResults.weekKey, winnerFaction: luoyangWeeklyResults.winnerFaction }).from(luoyangWeeklyResults).orderBy(desc(luoyangWeeklyResults.weekKey)).limit(12);
  const factions = await db.select({ faction: cityDamageRankings.faction, damage: sql`SUM(${cityDamageRankings.totalDamage})`.mapWith(Number), battles: sql`SUM(${cityDamageRankings.battleCount})`.mapWith(Number) }).from(cityDamageRankings).where(eq(cityDamageRankings.cityId, LUOYANG_CITY_ID)).groupBy(cityDamageRankings.faction);
  const top = await db.select({ displayName: cityDamageRankings.displayName, faction: cityDamageRankings.faction, totalDamage: cityDamageRankings.totalDamage }).from(cityDamageRankings).where(eq(cityDamageRankings.cityId, LUOYANG_CITY_ID)).orderBy(desc(cityDamageRankings.totalDamage)).limit(5);
  return { weeks, factions, top };
}
/** 낙양 주간 보상 확인: 지급 대상이면 지급하고, 현재 보상 주차와 금액을 돌려준다(클라이언트가 반영) */
async function getLuoyangReward(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureFactionTerritories(db);
  await grantLuoyangBox(db, userId);
  const rows = await db.select({ weekKey: gameAccountStates.luoyangRewardWeekKey, reward: gameAccountStates.lastLuoyangReward }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  return { weekKey: rows[0]?.weekKey ?? null, reward: rows[0]?.reward ?? 0 };
}
async function getFactionTerritories(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureFactionTerritories(db);
  await advanceNeutralTerritoryAi(db);
  // 낙양전 보상은 account.luoyangReward에서만 지급한다(게임이 받은 금화를 바로 반영하게)
  const rows = await db.select().from(factionTerritoryStates);
  const byCityId = new Map(rows.map(row => [row.cityId, row]));
  const logs = await db.select().from(neutralAiBattleLogs).where(inArray(neutralAiBattleLogs.cityId, FACTION_TERRITORY_SEED.map(city => city.cityId))).orderBy(asc(neutralAiBattleLogs.occurredAt));
  const logsByCityId = new Map();
  for (const log of logs) {
    const cityLogs = logsByCityId.get(log.cityId) ?? [];
    cityLogs.push(log);
    logsByCityId.set(log.cityId, cityLogs.slice(-30));
  }
  return FACTION_TERRITORY_SEED.map(city => factionTerritoryView(byCityId.get(city.cityId) ?? city, logsByCityId.get(city.cityId) ?? []));
}
async function recordFactionTerritoryBattle(userId, input, { operator = false } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // 운영자 계정의 전투는 영토(공성 진행 · 점령 · 세력전 금화 · 도시 피해 순위)에 반영하지 않는다
  if (operator) return getFactionTerritories(userId);
  if (!FACTION_TERRITORY_IDS.has(input.cityId)) throw new Error("해당 도시를 찾을 수 없습니다.");
  await ensureFactionTerritories(db);
  await advanceNeutralTerritoryAi(db);
  if (input.cityId === LUOYANG_CITY_ID && !isLuoyangWindowOpen()) return getFactionTerritories(userId);
  if (!input.won) return getFactionTerritories(userId);
  const account = await db.select({ faction: gameAccountStates.faction }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  const faction = account[0]?.faction ?? "촉한";
  const damage = Math.max(1, Math.min(CITY_DEFENSE_BY_LEVEL[5], Math.trunc(input.damage)));
  await db.transaction(async tx => {
    const rows = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, input.cityId)).limit(1).for("update");
    const current = rows[0];
    if (!current || current.owner === faction) return;
    const finalRequested = Boolean(input.captured);
    // The client sends captured=true only after the local final faction battle
    // has passed the zero-defense and garrison checks. Treat that successful
    // final-war result as authoritative even when this shared row is stale
    // from an earlier failed siege sync; otherwise the next list query can
    // overwrite the newly captured city with the old neutral snapshot.
    const captured = finalRequested;
    const conquestProgress = captured ? 100 : Math.min(100, Number(current.conquestProgress) + damage);
    // The row lock makes the first final-war request authoritative.
    // A later concurrent request observes the new owner and is ignored.
    await tx.update(factionTerritoryStates).set({
      owner: captured ? faction : current.owner,
      conquestProgress,
      // A newly captured city starts its next defense cycle at full wall strength.
      // Keeping defense at 0 lets the neutral AI tick capture it back to neutral
      // immediately after the successful final faction battle is synchronized.
      defense: captured ? cityDefenseForLevel(CITY_LEVEL_BY_ID[input.cityId] ?? 1) : Math.max(cityDefenseFloor(input.cityId), Number(current.defense) - damage),
      prosperity: captured ? Math.max(30, Number(current.prosperity) - 20) : current.prosperity,
      // 주인이 바뀌면 이전 진영의 수비대는 사라진다.
      ...(captured ? { garrisonsData: null } : {}),
      version: sql`${factionTerritoryStates.version} + 1`,
      updatedByUserId: userId
    }).where(eq(factionTerritoryStates.cityId, input.cityId));
    if (captured) {
      // 세력전 승리 금화는 서버가 점령을 기록하는 이 순간에만 적립하고, 유저가 grant(faction)으로 받아 간다.
      const accounts = await tx.select({ grantLedger: gameAccountStates.grantLedger }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
      if (accounts[0]) {
        const ledger = parseStateJson(accounts[0].grantLedger) ?? {};
        ledger.factionPending = (Number(ledger.factionPending) || 0) + (FACTION_WAR_GOLD[CITY_LEVEL_BY_ID[input.cityId]] ?? FACTION_WAR_GOLD[5]);
        await tx.update(gameAccountStates).set({ grantLedger: JSON.stringify(ledger) }).where(eq(gameAccountStates.userId, userId));
      }
    }
  });
  if (input.won && damage > 0) {
    const profile = await db.select({ name: users.name, faction: gameAccountStates.faction }).from(gameAccountStates).leftJoin(users, eq(users.id, gameAccountStates.userId)).where(eq(gameAccountStates.userId, userId)).limit(1);
    const displayName = String(profile[0]?.name ?? '이름 없는 장군').slice(0, 128);
    const faction = profile[0]?.faction ?? '촉한';
    await db.insert(cityDamageRankings).values({ cityId: input.cityId, userId, faction, displayName, totalDamage: damage, battleCount: 1 }).onDuplicateKeyUpdate({
      set: {
        faction,
        displayName,
        totalDamage: sql`${cityDamageRankings.totalDamage} + ${damage}`,
        battleCount: sql`${cityDamageRankings.battleCount} + 1`
      }
    });
  }
  return getFactionTerritories(userId);
}
async function userFaction(db, userId) {
  const account = await db.select({ faction: gameAccountStates.faction }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  return account[0]?.faction ?? "촉한";
}
/** 아군 도시에 수비대를 세운다(진영 공용). 클라이언트의 deployCityGarrison과 같은 규칙: 새로 세우면 격파 기록이 초기화된다. */
async function deployFactionGarrison(userId, input, { operator = false } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (operator) throw new Error("운영자 계정은 영토전에 수비병을 세울 수 없습니다(영토전 결과에 영향 없음).");
  if (!FACTION_TERRITORY_IDS.has(input.cityId)) throw new Error("해당 도시를 찾을 수 없습니다.");
  await ensureFactionTerritories(db);
  const faction = await userFaction(db, userId);
  await db.transaction(async tx => {
    const rows = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, input.cityId)).limit(1).for("update");
    const current = rows[0];
    if (!current || current.owner !== faction) throw new Error("아군 도시에서만 수비병을 세울 수 있습니다.");
    const garrisons = parseGarrisons(current);
    if (garrisons.list.some(g => g.id === input.garrisonId)) return;
    if (garrisons.list.length >= MAX_CITY_GARRISONS) throw new Error(`수비병은 한 도시에 최대 ${MAX_CITY_GARRISONS}부대까지 세울 수 있습니다.`);
    garrisons.list.push({ id: input.garrisonId, userId, power: input.power, averageLevel: input.averageLevel, label: input.label });
    garrisons.defeated = 0;
    await tx.update(factionTerritoryStates).set({ garrisonsData: serializeGarrisons(garrisons), version: sql`${factionTerritoryStates.version} + 1`, updatedByUserId: userId }).where(eq(factionTerritoryStates.cityId, input.cityId));
  });
  return getFactionTerritories(userId);
}
/** 유저가 지휘한 방어전: 서버가 직접 판정한다(클라이언트 결과를 믿지 않음). 방어전으로는 도시를 잃지 않는다. */
async function recordFactionDefense(userId, input, { operator = false } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (operator) return { outcome: null, operator: true, territories: await getFactionTerritories(userId) };
  if (!FACTION_TERRITORY_IDS.has(input.cityId)) throw new Error("해당 도시를 찾을 수 없습니다.");
  await ensureFactionTerritories(db);
  await advanceNeutralTerritoryAi(db);
  const faction = await userFaction(db, userId);
  let outcome = null;
  await db.transaction(async tx => {
    const all = await tx.select().from(factionTerritoryStates);
    const byCityId = new Map(all.map(row => [row.cityId, row]));
    const rows = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, input.cityId)).limit(1).for("update");
    const current = rows[0];
    if (!current || current.owner !== faction) return;
    const attackerLevel = strongestNeutralNeighborLevel(current.cityId, byCityId) || (CITY_LEVEL_BY_ID[current.cityId] ?? 1);
    const { set, result } = applyRaidToRow(current, "drill", attackerLevel, Date.now(), { allowCapture: false, updatedByUserId: userId });
    await tx.update(factionTerritoryStates).set(set).where(eq(factionTerritoryStates.cityId, current.cityId));
    outcome = result;
  });
  return { outcome, territories: await getFactionTerritories(userId) };
}
async function getCityDamageRankings(cityId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!FACTION_TERRITORY_IDS.has(cityId)) throw new Error("해당 도시를 찾을 수 없습니다.");
  const operators = await operatorUserIds(db);
  const rows = await db.select({ userId: cityDamageRankings.userId, faction: cityDamageRankings.faction, displayName: cityDamageRankings.displayName, totalDamage: cityDamageRankings.totalDamage, battleCount: cityDamageRankings.battleCount, updatedAt: cityDamageRankings.updatedAt }).from(cityDamageRankings).where(eq(cityDamageRankings.cityId, cityId)).orderBy(desc(cityDamageRankings.totalDamage), asc(cityDamageRankings.updatedAt)).limit(10 + operators.size);
  return rows.filter(row => !operators.has(row.userId)).slice(0, 10);
}
async function listGameStates() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const accounts = await db.select().from(users).limit(200);
  const states = await db.select().from(gameAccountStates);
  const byUser = new Map(states.map(state => [state.userId, state]));
  return accounts.map(user => ({ ...user, ...(byUser.get(user.id) ?? { userId: user.id, ...defaultGameState, updatedAt: new Date() }), operator: isOperatorUser(user) }));
}
/**
 * 유저 대련 상대: 덱을 저장한 지휘관(나 포함)이 DUEL_USER_THRESHOLD명 이상이면 내 덱 전력과 비슷한 실제 유저 덱,
 * 그보다 적으면 mode 'dummy'(게임이 내 전력에 맞춘 훈련 상대를 만든다).
 * power를 보내지 않은 옛 게임은 전적 점수 순 목록(배열)을 받는다.
 */
async function listDuelOpponents(viewerId, limit = 12, power) {
  // 운영자 덱(관리자가 고친 계정)은 대련 상대로 나오지 않는다
  const accounts = (await listGameStates()).filter(account => !account.operator);
  const decks = accounts.map(account => {
    const generals = parseStateJson(account.generalData);
    const formation = parseStateJson(account.formationData);
    if (!Array.isArray(generals) || !Array.isArray(formation)) return null;
    const byId = new Map(generals.filter(general => general && typeof general.id === 'string').map(general => [general.id, general]));
    const deck = formation.slice(0, 3).map(id => byId.get(id)).filter(Boolean);
    if (!deck.length) return null;
    return {
      id: `user-${account.id}`,
      userId: account.id,
      displayName: account.name || `지휘관 ${account.id}`,
      score: Number.isFinite(Number(account.battleScore)) ? Number(account.battleScore) : 0,
      power: duelDeckPower(deck),
      isDummy: false,
      deck,
    };
  }).filter(Boolean);
  const others = decks.filter(entry => entry.userId !== viewerId).map(({ userId: _userId, ...entry }) => entry);
  if (power === undefined) return others.sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.min(50, limit)));
  const registered = decks.length;
  if (registered < DUEL_USER_THRESHOLD) return { mode: "dummy", registered, threshold: DUEL_USER_THRESHOLD, opponents: [] };
  return { mode: "users", registered, threshold: DUEL_USER_THRESHOLD, opponents: pickDuelMatches(others, power, Math.max(1, Math.min(DUEL_MATCH_COUNT, limit))) };
}
// ── 주간 레이드 ─────────────────────────────────────────────
/** 저장된 1·2·3군 덱(서버 저장 능력치 기준) */
function savedSquadDecks(account) {
  const generals = parseStateJson(account.generalData);
  const formation = parseStateJson(account.formationData);
  const reserves = parseStateJson(account.squadData);
  if (!Array.isArray(generals)) return [];
  const byId = new Map(generals.filter(general => general && typeof general.id === "string").map(general => [general.id, general]));
  const lists = [Array.isArray(formation) ? formation : [], ...(Array.isArray(reserves) ? reserves : [])].slice(0, RAID_SQUADS);
  const seen = new Set();
  return lists.map(list => (Array.isArray(list) ? list : []).slice(0, 3).filter(id => typeof id === "string" && !seen.has(id) && seen.add(id)).map(id => byId.get(id)).filter(Boolean));
}
let raidLevelCache = { at: 0, weekKey: "", level: 0, registered: 0 };
/** 보스 레벨: 덱 저장 지휘관 20명 이하면 Lv30, 아니면 전력 상위 300명 1군 평균 레벨(10분 캐시) */
async function currentRaidBossLevel(now = Date.now()) {
  const weekKey = raidWeekKey(now);
  if (raidLevelCache.weekKey === weekKey && now - raidLevelCache.at < 10 * 60 * 1000) return raidLevelCache;
  const accounts = (await listGameStates()).filter(account => !account.operator);
  const decks = accounts.map(account => savedSquadDecks(account)[0] ?? []).filter(deck => deck.length);
  const ranked = decks.map(deck => ({ power: duelDeckPower(deck), level: deck.reduce((sum, general) => sum + Math.min(60, Number(general.level) || 1), 0) / deck.length })).sort((left, right) => right.power - left.power);
  raidLevelCache = { at: now, weekKey, level: raidBossLevel(ranked.map(entry => entry.level)), registered: ranked.length };
  return raidLevelCache;
}
async function raidRow(db, weekKey, userId) {
  const rows = await db.select().from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${userId}`).limit(1);
  return rows[0] ?? null;
}
/** 운영자를 뺀 순위(운영자 본인은 0 = 순위 없음) */
async function raidRankOf(db, weekKey, totalDamage, userId = null) {
  if (!(totalDamage > 0)) return 0;
  const operators = await operatorUserIds(db);
  if (userId !== null && operators.has(userId)) return 0;
  const rows = await db.select({ userId: raidWeeklyScores.userId }).from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.totalDamage} > ${totalDamage}`);
  return rows.filter(row => !operators.has(row.userId)).length + 1;
}
async function getRaidInfo(userId, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const weekKey = raidWeekKey(now), lastWeekKey = previousRaidWeekKey(now), today = raidDayKey(now);
  const boss = await currentRaidBossLevel(now);
  const mine = await raidRow(db, weekKey, userId);
  const last = await raidRow(db, lastWeekKey, userId);
  const lastRank = last ? await raidRankOf(db, lastWeekKey, Number(last.totalDamage), userId) : 0;
  const operators = await operatorUserIds(db);
  const participantRows = await db.select({ userId: raidWeeklyScores.userId }).from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.totalDamage} > 0`);
  const participants = [{ count: participantRows.filter(row => !operators.has(row.userId)).length }];
  const usedToday = mine && mine.dayKey === today ? Number(mine.dayAttempts) || 0 : 0;
  return {
    weekKey, bossLevel: boss.level, registered: boss.registered, participants: Number(participants[0]?.count ?? 0),
    attemptsLeft: Math.max(0, RAID_DAILY_LIMIT - usedToday), dailyLimit: RAID_DAILY_LIMIT,
    totalDamage: Number(mine?.totalDamage ?? 0), bestDamage: Number(mine?.bestDamage ?? 0), attempts: Number(mine?.attempts ?? 0),
    rank: mine ? await raidRankOf(db, weekKey, Number(mine.totalDamage), userId) : 0,
    operator: operators.has(userId),
    lastWeek: last && Number(last.totalDamage) > 0 ? { weekKey: lastWeekKey, totalDamage: Number(last.totalDamage), rank: lastRank, reward: raidRewardFor(lastRank), claimed: Boolean(last.rewardClaimed) } : null,
  };
}
/** 도전 시작: 하루 3회 확인, 도전권 토큰과 피해 상한(1·2·3군 저장 전력) 기록 */
async function startRaid(user, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const weekKey = raidWeekKey(now), today = raidDayKey(now);
  const boss = await currentRaidBossLevel(now);
  const states = await db.select().from(gameAccountStates).where(eq(gameAccountStates.userId, user.id)).limit(1);
  const squads = states[0] ? savedSquadDecks(states[0]) : [];
  const cap = squads.reduce((sum, deck) => sum + raidDamageCap(duelDeckPower(deck)), 0);
  if (!cap) return { ok: false, reason: "저장된 출전 편성이 없습니다. 편성을 저장한 뒤 다시 도전하십시오." };
  return db.transaction(async tx => {
    await tx.insert(raidWeeklyScores).values({ weekKey, userId: user.id, displayName: user.name || `지휘관 ${user.id}` }).onDuplicateKeyUpdate({ set: { displayName: user.name || `지휘관 ${user.id}` } });
    const rows = await tx.select().from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${user.id}`).limit(1).for("update");
    const row = rows[0];
    const used = row.dayKey === today ? Number(row.dayAttempts) || 0 : 0;
    if (used >= RAID_DAILY_LIMIT) return { ok: false, reason: "오늘 레이드 도전을 모두 사용했습니다(하루 3회)." };
    const token = randomUUID();
    await tx.update(raidWeeklyScores).set({ dayKey: today, dayAttempts: used + 1, pendingToken: token, pendingPower: Math.min(2000000000, cap) }).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${user.id}`);
    return { ok: true, token, weekKey, bossLevel: boss.level, attemptsLeft: RAID_DAILY_LIMIT - used - 1 };
  });
}
/** 결과 제출: 1·2·3군 피해 합계를 상한(A안)으로 자른 뒤 이번 주 누적에 더한다 */
async function submitRaid(userId, input, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const weekKey = raidWeekKey(now);
  const result = await db.transaction(async tx => {
    const rows = await tx.select().from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${userId}`).limit(1).for("update");
    const row = rows[0];
    if (!row || !row.pendingToken || row.pendingToken !== input.token) return { ok: false, reason: "도전 정보가 맞지 않습니다(주차가 바뀌었거나 이미 제출했습니다)." };
    const claimed = input.damages.slice(0, RAID_SQUADS).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value) || 0)), 0);
    const cap = Number(row.pendingPower) || 0;
    const added = Math.min(claimed, cap);
    const total = Number(row.totalDamage) + added;
    await tx.update(raidWeeklyScores).set({ totalDamage: total, bestDamage: Math.max(Number(row.bestDamage), added), attempts: Number(row.attempts) + 1, pendingToken: null, pendingPower: 0 }).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${userId}`);
    if (claimed > cap) console.warn(`[raid] user ${userId} damage ${claimed} capped to ${cap} (${weekKey})`);
    return { ok: true, added, capped: claimed > cap, totalDamage: total };
  });
  if (!result.ok) return result;
  return { ...result, rank: await raidRankOf(db, weekKey, result.totalDamage, userId) };
}
async function getRaidRanking(userId, limit = 100, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const weekKey = raidWeekKey(now);
  const operators = await operatorUserIds(db);
  const size = Math.max(1, Math.min(100, limit));
  const rows = (await db.select({ userId: raidWeeklyScores.userId, displayName: raidWeeklyScores.displayName, totalDamage: raidWeeklyScores.totalDamage, attempts: raidWeeklyScores.attempts }).from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.totalDamage} > 0`).orderBy(desc(raidWeeklyScores.totalDamage), asc(raidWeeklyScores.updatedAt)).limit(size + operators.size)).filter(row => !operators.has(row.userId)).slice(0, size);
  return { weekKey, rows: rows.map((row, index) => ({ rank: index + 1, displayName: row.displayName, totalDamage: Number(row.totalDamage), attempts: Number(row.attempts), isMe: row.userId === userId })) };
}
/** 지난주 순위 보상 받기(금화·낙양 강화석은 서버 원장에 바로 더한다) */
async function claimRaidReward(userId, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const weekKey = previousRaidWeekKey(now);
  return db.transaction(async tx => {
    const rows = await tx.select().from(raidWeeklyScores).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${userId}`).limit(1).for("update");
    const row = rows[0];
    if (!row || !(Number(row.totalDamage) > 0)) return { ok: false, reason: "지난주 레이드 기록이 없습니다.", gold: 0, stones: 0 };
    if (row.rewardClaimed) return { ok: false, reason: "지난주 레이드 보상을 이미 받았습니다.", gold: 0, stones: 0 };
    const rank = await raidRankOf(tx, weekKey, Number(row.totalDamage), userId);
    if (!rank) return { ok: false, reason: "운영자 계정은 레이드 순위 보상이 없습니다.", gold: 0, stones: 0 };
    const reward = raidRewardFor(rank);
    await tx.update(raidWeeklyScores).set({ rewardClaimed: 1 }).where(sql`${raidWeeklyScores.weekKey} = ${weekKey} AND ${raidWeeklyScores.userId} = ${userId}`);
    await tx.update(gameAccountStates).set({ gold: sql`${gameAccountStates.gold} + ${reward.gold}`, mythicStones: sql`${gameAccountStates.mythicStones} + ${reward.stones}` }).where(eq(gameAccountStates.userId, userId));
    return { ok: true, rank, gold: reward.gold, stones: reward.stones, weekKey };
  });
}
// 금화·신화 조각·낙양 강화석은 서버 원장이 기준이다.
// 클라이언트 저장은 이 값을 "줄이는" 것(사용)만 할 수 있고, 늘리는 것은 grantCurrency·낙양 보상만 한다.
const SERVER_LEDGER_KEYS = ["gold", "mythicFragments", "mythicStones"];
async function updateGameState(userId, input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  // 낙양 보상 주차는 서버만 정한다: 클라이언트가 옛 주차로 덮어써 보상이 두 번 나가지 않게 한다.
  const { luoyangRewardWeekKey: _ignoredWeekKey, adminPatchAck, ...values } = input;
  const current = await db.select({ gold: gameAccountStates.gold, mythicFragments: gameAccountStates.mythicFragments, mythicStones: gameAccountStates.mythicStones, grantLedger: gameAccountStates.grantLedger }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  // 관리자가 고친 값이 있으면: 클라이언트가 받아들이기(ack) 전까지 저장값을 관리자 값으로 바꾸고, 응답으로 알려 준다
  const ledger = parseStateJson(current[0]?.grantLedger) ?? {};
  let adminPatch = null, clearPatch = false;
  if (ledger.adminPatch) {
    const patch = activeAdminPatch(ledger);
    if (!patch || adminPatchAck === ledger.adminPatch.id) clearPatch = true;
    else {
      for (const [key, value] of Object.entries(patch.values)) if (key in ADMIN_EDITABLE) values[key] = value;
      adminPatch = { id: patch.id, values: patch.values };
    }
  }
  for (const key of SERVER_LEDGER_KEYS) {
    if (values[key] === undefined) continue;
    const serverValue = current[0] ? Number(current[0][key] ?? 0) : 0;
    values[key] = Math.max(0, Math.min(Number(values[key]), serverValue));
  }
  await db.insert(gameAccountStates).values({ userId, ...values }).onDuplicateKeyUpdate({ set: values });
  // 받아들인(또는 시간이 지난) 관리자 수정 표시는 장부의 그 칸만 지운다(같은 때 들어온 보상 기록은 그대로)
  if (clearPatch) await db.update(gameAccountStates).set({ grantLedger: sql`JSON_REMOVE(${gameAccountStates.grantLedger}, '$.adminPatch')` }).where(eq(gameAccountStates.userId, userId));
  // The client already owns the canonical state. Avoid a second full-row read
  // (including large JSON inventories) after every write.
  return { ok: true, userId, gold: values.gold, mythicFragments: values.mythicFragments, mythicStones: values.mythicStones, ...(adminPatch ? { adminPatch } : {}) };
}
/**
 * 게스트 계정 진행 초기화: 이 계정의 게임 저장(무장 · 재화 · 임무 · 튜토리얼 · 출석 · 보상 장부)을 지워 처음 상태로 돌린다.
 * 아이디(사용자 행)는 그대로 둔다. 회원(Manus 로그인) 계정은 지울 수 없다.
 */
async function resetGuestGameState(user) {
  if (!user || typeof user.openId !== "string" || !user.openId.startsWith("guest_")) throw new Error("게스트 계정만 초기화할 수 있습니다.");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(gameAccountStates).where(eq(gameAccountStates.userId, user.id));
  return { ok: true };
}
/** 관리자 편집 가능 항목(숫자 최대치 · 진영) */
const ADMIN_EDITABLE = { honor: 1, silver: 1, gold: 1, manuals: 1, wins: 1, battleScore: 1, grain: 1, wood: 1, iron: 1, influence: 1, mythicFragments: 1, mythicStones: 1, factionWarScore: 1, luoyangBoxes: 1, faction: 1 };
/**
 * 관리자 편집: 서버 원장 재화(금화 · 신화 조각 · 낙양 강화석)도 그대로 정한다(사용자 저장의 '줄이기만' 규칙을 거치지 않음).
 * 은전은 자원 칸(resources.silver)과 같이 쓴다. 접속 중인 클라이언트가 덮어쓰지 않게 adminPatch를 남긴다.
 */
async function adminUpdateGameState(userId, input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = Object.fromEntries(Object.entries(input).filter(([key, value]) => key in ADMIN_EDITABLE && value !== undefined));
  if (!Object.keys(values).length) throw new Error("바꿀 값이 없습니다.");
  return db.transaction(async tx => {
    const rows = await tx.select({ grantLedger: gameAccountStates.grantLedger }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
    const ledger = parseStateJson(rows[0]?.grantLedger) ?? {};
    const previous = activeAdminPatch(ledger)?.values ?? {};
    ledger.adminPatch = { id: randomUUID(), at: Date.now(), values: { ...previous, ...values } };
    const set = { ...values, grantLedger: JSON.stringify(ledger) };
    if (rows[0]) await tx.update(gameAccountStates).set(set).where(eq(gameAccountStates.userId, userId));
    else await tx.insert(gameAccountStates).values({ userId, ...defaultGameState, ...set });
    const after = await tx.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
    return adminGameView(after[0]);
  });
}
/** 관리자 화면용 계정 게임 정보(편집 칸 + 읽기 전용 진행 요약) */
function adminGameView(row) {
  const generals = parseStateJson(row?.generalData);
  const scenarios = parseStateJson(row?.scenarioData);
  const list = Array.isArray(generals) ? generals : [];
  const cleared = Array.isArray(scenarios) ? scenarios.filter(item => typeof item === "string") : [];
  return {
    userId: row?.userId, honor: row?.honor ?? 0, silver: row?.silver ?? 0, gold: row?.gold ?? 0, manuals: row?.manuals ?? 0, wins: row?.wins ?? 0, battleScore: row?.battleScore ?? 0,
    grain: row?.grain ?? 0, wood: row?.wood ?? 0, iron: row?.iron ?? 0, influence: row?.influence ?? 0,
    mythicFragments: row?.mythicFragments ?? 0, mythicStones: row?.mythicStones ?? 0, factionWarScore: row?.factionWarScore ?? 0, luoyangBoxes: row?.luoyangBoxes ?? 0,
    faction: row?.faction ?? "촉한", factionChosen: Boolean(row?.factionChosen),
    generalCount: list.length, maxLevel: list.reduce((max, general) => Math.max(max, Number(general?.level) || 0), 0),
    scenarioCleared: cleared.filter(item => !item.includes(":")).length, hardCleared: cleared.filter(item => item.startsWith("hard:")).length,
    updatedAt: row?.updatedAt ?? null,
  };
}

const PRELAUNCH_DAILY_GOLD = 100;
// 정식 출시(launch.mjs의 OFFICIAL_LAUNCH 또는 환경 변수 OFFICIAL_LAUNCH=1)가 되면 매일 금화는 자동으로 멈춘다.
const PRELAUNCH_GOLD_ENABLED = true;
const FACTION_WAR_GOLD = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 };
const DUEL_DAILY_LIMIT = 5;
function seoulDayKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
/**
 * 서버가 확인한 뒤에만 금화·신화 조각을 늘린다.
 *  - daily: 정식 출시 전 매일 금화(한국 날짜 기준 하루 1회)
 *  - scenario: 시나리오 최초 클리어 금화(시나리오마다 1회, 금액은 시나리오 번호로 서버가 계산)
 *  - faction: 세력전 승리 금화(서버가 점령을 기록할 때 적립해 둔 만큼만)
 *  - duel: 유저 대련 승리 신화 조각(하루 5회 · 쉬움 1 · 보통 2 · 어려움 3)
 */
async function grantCurrency(userId, input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    let rows = await tx.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
    // 막 만든 계정(첫 저장 전)도 보상을 받을 수 있게 기본 줄을 먼저 만든다
    if (!rows[0]) {
      await tx.insert(gameAccountStates).values({ userId, ...defaultGameState }).onDuplicateKeyUpdate({ set: { userId } });
      rows = await tx.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
    }
    const account = rows[0];
    if (!account) return { granted: 0, kind: input.kind, reason: "계정 정보를 찾을 수 없습니다." };
    const ledger = parseStateJson(account.grantLedger) ?? {};
    const today = seoulDayKey();
    let gold = 0, fragments = 0, stones = 0, day = 0, reason = "";
    if (input.kind === "daily") {
      if (!PRELAUNCH_GOLD_ENABLED || isLaunched()) reason = "일일 금화 지급 기간이 아닙니다.";
      else if (ledger.daily === today) reason = "오늘 금화를 이미 받았습니다.";
      else { gold = PRELAUNCH_DAILY_GOLD; ledger.daily = today; }
    } else if (input.kind === "scenario") {
      const match = /^scenario-(\d+)-(\d+)-(\d+)$/.exec(String(input.key ?? ""));
      const claimed = Array.isArray(ledger.scenarios) ? ledger.scenarios : [];
      if (!match) reason = "알 수 없는 시나리오입니다.";
      else if (claimed.includes(input.key)) reason = "이미 받은 시나리오 보상입니다.";
      else { gold = scenarioGold(Number(match[2])); ledger.scenarios = [...claimed, input.key].slice(-500); }
    } else if (input.kind === "faction") {
      const pending = Number(ledger.factionPending) || 0;
      if (pending <= 0) reason = "받을 세력전 보상이 없습니다.";
      else {
        const bonus = Math.min(0.2, Math.max(0, Number(input.bonus) || 0));
        gold = Math.round(pending * (1 + bonus));
        ledger.factionPending = 0;
      }
    } else if (input.kind === "attendance") {
      // 출석 체크: 한국 날짜로 하루 한 번, 다음 날짜의 보상(장부 재화만 서버가 더한다)
      const next = nextAttendanceDay(ledger.attendance, today);
      if (next === null) reason = (Number(ledger.attendance?.count) || 0) >= 37 ? "출석 체크 이벤트를 모두 마쳤습니다." : "오늘 출석 보상을 이미 받았습니다.";
      else {
        day = next;
        ledger.attendance = { count: next, last: today };
        ({ gold, fragments, stones } = attendanceLedger(next));
        await tx.update(gameAccountStates).set({ grantLedger: JSON.stringify(ledger) }).where(eq(gameAccountStates.userId, userId));
      }
    } else if (input.kind === "duel") {
      const count = ledger.duelDay === today ? Number(ledger.duelCount) || 0 : 0;
      if (count >= DUEL_DAILY_LIMIT) reason = "오늘 받을 수 있는 대련 보상을 모두 받았습니다.";
      // 난이도별 조각: key "duel-easy|normal|hard" (옛 게임은 key 없이 보낸다 → 1개)
      else { const tier = String(input.key ?? "").replace(/^duel-/, ""); fragments = DUEL_TIER_FRAGMENTS[tier] ?? 1; ledger.duelDay = today; ledger.duelCount = count + 1; }
    }
    if (gold || fragments || stones) {
      await tx.update(gameAccountStates).set({ gold: sql`${gameAccountStates.gold} + ${gold}`, mythicFragments: sql`${gameAccountStates.mythicFragments} + ${fragments}`, mythicStones: sql`${gameAccountStates.mythicStones} + ${stones}`, grantLedger: JSON.stringify(ledger) }).where(eq(gameAccountStates.userId, userId));
    }
    return { kind: input.kind, granted: gold, fragments, stones, day, reason };
  });
}

// starters/web-db-user-v1/server/_core/cookies.ts
function getSessionCookieOptions(_req) {
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

// starters/web-db-user-v1/shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
  statusCode;
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// starters/web-db-user-v1/server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured! Set MANUS_OAUTH_API_URL environment variable."
      );
    }
  }
  client;
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("MANUS_JWT_SECRET is unavailable");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || (!isNonEmptyString(appId) || appId !== ENV.appId) || typeof name !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && req.path.startsWith("/api/scheduled/")) {
      const ticket = cookies.get("app_session_id");
      const identity = await this.verifySession(ticket);
      if (identity?.openId.startsWith(CRON_OPEN_ID_PREFIX)) sessionToken = ticket;
    }
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// starters/web-db-user-v1/server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app, { afterLogin } = {}) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      // Steam 데스크톱 앱 로그인(server/desktop-auth.mjs)이면 앱으로 돌려보낸다.
      if (afterLogin && await afterLogin(req, res, { openId: userInfo.openId, name: userInfo.name || "" })) return;
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// starters/web-db-user-v1/server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// starters/web-db-user-v1/server/_core/systemRouter.ts
import { z } from "zod";

// starters/web-db-user-v1/server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// starters/web-db-user-v1/server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.email?.trim().toLowerCase() !== ENV.adminEmail)) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// starters/web-db-user-v1/server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// starters/web-db-user-v1/server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// starters/web-db-user-v1/server/_core/publicConfig.ts
function publicPlatformConfig(env = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? ""
  };
}
export {
  ENV,
  findUserByName,
  createGuestUser,
  getUserByOpenId,
  setSessionCookie,
  OAUTH_STATE_COOKIE,
  ONE_YEAR_MS,
  sdk,
  createContext,
  adminProcedure,
  getDb,
  getGameState,
  getFactionTerritories,
  getLuoyangReward,
  getLuoyangHistory,
  grantCurrency,
  listDuelOpponents,
  getRaidInfo,
  startRaid,
  submitRaid,
  getRaidRanking,
  claimRaidReward,
  listGameStates,
  listUsers,
  protectedProcedure,
  updateGameState,
  adminUpdateGameState,
  resetGuestGameState,
  adminGameView,
  isOperatorUser,
  clearOperatorCache,
  recordFactionTerritoryBattle,
  deployFactionGarrison,
  recordFactionDefense,
  getCityDamageRankings,
  updateUserRole,
  updateUserName,
  publicPlatformConfig,
  publicProcedure,
  registerOAuthRoutes,
  router,
  appRouter as webdevRouter
};
